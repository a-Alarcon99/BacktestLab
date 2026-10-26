import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { backtestRuns, strategies, usageCounters, usageDaily } from "@/db/schema";
import type { StrategyDraft } from "@/lib/strategy";
import { subjectsOf, type Identity } from "./identity";

// Quota accounting. Consuming is one atomic conditional upsert per counter (`... WHERE n < cap`),
// so concurrent requests can't overshoot. Nothing decrements on delete: counters count what was
// *consumed*, not what currently exists. The only decrement is `refundBacktest`, which undoes a
// run the server itself failed to execute.

export type LimitKind = "strategies" | "backtests_total" | "backtests_daily";

export class LimitError extends Error {
  constructor(
    readonly kind: LimitKind,
    readonly max: number,
    /** Backtest units the refused operation needed (1 for a single run). */
    readonly needed = 1,
  ) {
    super(`limit reached: ${kind}`);
  }
}

export class NameTakenError extends Error {}

const INT_MAX = 2_147_483_647;
const cap = (limit: number | null, multiplier: number) => (limit === null ? INT_MAX : limit * multiplier);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function bumpCounter(
  tx: Tx,
  column: "strategies_created" | "backtests_total",
  key: string,
  max: number,
  units = 1,
) {
  // A first insert of `units` has no row to compare with, so it is checked here.
  if (max < units) return false;
  const col = sql.raw(column);
  const rows = await tx.execute(sql`
    insert into usage_counters (subject_key, ${col}) values (${key}, ${units})
    on conflict (subject_key) do update
      set ${col} = usage_counters.${col} + ${units}, updated_at = now()
      where usage_counters.${col} + ${units} <= ${max}
    returning ${col}`);
  return rows.length > 0;
}

async function bumpDaily(tx: Tx, key: string, max: number, units = 1) {
  if (max < units) return false;
  const rows = await tx.execute(sql`
    insert into usage_daily (subject_key, day, backtests)
    values (${key}, (now() at time zone 'utc')::date, ${units})
    on conflict (subject_key, day) do update
      set backtests = usage_daily.backtests + ${units}
      where usage_daily.backtests + ${units} <= ${max}
    returning backtests`);
  return rows.length > 0;
}

/** Stable digest of a backtest request (object keys sorted), used to recognise a re-run. */
export function requestHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/**
 * Charges `units` backtests to the caller (one per asset of a multi-asset run; the server works
 * the number out from the request, never the client), or throws `LimitError` without charging
 * anything. A request this subject already paid for (same digest) is a re-run of its own history
 * and is free: results are deterministic.
 */
export async function consumeBacktest(identity: Identity, hash: string, units = 1): Promise<{ charged: boolean }> {
  const { plan } = identity;
  return db.transaction(async (tx) => {
    const seen = await tx
      .select({ h: backtestRuns.requestHash })
      .from(backtestRuns)
      .where(and(eq(backtestRuns.subjectKey, identity.key), eq(backtestRuns.requestHash, hash)))
      .limit(1);
    if (seen.length > 0) return { charged: false };

    for (const { key, multiplier } of subjectsOf(identity)) {
      const total = cap(plan.maxBacktestsTotal, multiplier);
      if (!(await bumpCounter(tx, "backtests_total", key, total, units)))
        throw new LimitError("backtests_total", plan.maxBacktestsTotal ?? total, units);
      const daily = cap(plan.maxBacktestsPerDay, multiplier);
      if (!(await bumpDaily(tx, key, daily, units)))
        throw new LimitError("backtests_daily", plan.maxBacktestsPerDay ?? daily, units);
    }
    await tx.insert(backtestRuns).values({ subjectKey: identity.key, requestHash: hash }).onConflictDoNothing();
    return { charged: true };
  });
}

/**
 * Undoes `consumeBacktest` (the same `units`) when the run failed on the server's side, not for
 * user deletions. With `keepRun` only some units are given back (the assets of a batch that had
 * nothing to run on) and the digest stays, so reopening that batch is still a free re-run.
 */
export async function refundBacktest(identity: Identity, hash: string, units = 1, keepRun = false): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { key } of subjectsOf(identity)) {
      await tx.execute(sql`
        update usage_counters set backtests_total = greatest(backtests_total - ${units}, 0) where subject_key = ${key}`);
      await tx.execute(sql`
        update usage_daily set backtests = greatest(backtests - ${units}, 0)
        where subject_key = ${key} and day = (now() at time zone 'utc')::date`);
    }
    if (!keepRun)
      await tx
        .delete(backtestRuns)
        .where(and(eq(backtestRuns.subjectKey, identity.key), eq(backtestRuns.requestHash, hash)));
  });
}

export type StoredStrategy = typeof strategies.$inferSelect;

export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Creates a strategy, consuming one strategy quota. A name clash rolls the charge back. */
export async function createStrategy(identity: Identity, draft: StrategyDraft): Promise<StoredStrategy> {
  const { plan } = identity;
  try {
    return await db.transaction(async (tx) => {
      for (const { key, multiplier } of subjectsOf(identity)) {
        const max = cap(plan.maxStrategies, multiplier);
        if (!(await bumpCounter(tx, "strategies_created", key, max)))
          throw new LimitError("strategies", plan.maxStrategies ?? max);
      }
      const { name, ...data } = draft;
      const [row] = await tx.insert(strategies).values({ ownerKey: identity.key, name, data }).returning();
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new NameTakenError();
    throw error;
  }
}

export type UsageSnapshot = {
  strategiesCreated: number;
  backtestsTotal: number;
  backtestsToday: number;
};

export async function readUsage(identity: Identity): Promise<UsageSnapshot> {
  const [counters] = await db
    .select()
    .from(usageCounters)
    .where(eq(usageCounters.subjectKey, identity.key))
    .limit(1);
  const [today] = await db
    .select({ n: usageDaily.backtests })
    .from(usageDaily)
    .where(and(eq(usageDaily.subjectKey, identity.key), sql`${usageDaily.day} = (now() at time zone 'utc')::date`))
    .limit(1);
  return {
    strategiesCreated: counters?.strategiesCreated ?? 0,
    backtestsTotal: counters?.backtestsTotal ?? 0,
    backtestsToday: today?.n ?? 0,
  };
}
