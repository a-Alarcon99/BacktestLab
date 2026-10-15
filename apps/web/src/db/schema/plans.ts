import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";

// Plans and usage. Limits live in `plans` (a NULL limit = unlimited), so changing a limit or
// adding a subscription tier is a row, not a deploy. Usage is counted per *subject*:
// `u:<userId>` for accounts, `g:<guestId>` for a guest cookie, `ip:<hmac>` for the guest IP
// bucket. Counters only ever go up when a quota is consumed; deleting a strategy or a backtest
// never touches them.

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Strategies a subject may ever create (lifetime). */
  maxStrategies: integer("max_strategies"),
  /** Backtests a subject may ever run (lifetime). Used by the guest plan. */
  maxBacktestsTotal: integer("max_backtests_total"),
  /** Backtests per UTC day. */
  maxBacktestsPerDay: integer("max_backtests_per_day"),
  /** Runs kept in the history. */
  historySize: integer("history_size").notNull(),
  /**
   * Anonymous plans only: the IP bucket may consume `limit * ipShareMultiplier`, so clearing
   * cookies does not reset the quota while shared networks (NAT) still have headroom.
   * NULL = no IP bucket.
   */
  ipShareMultiplier: integer("ip_share_multiplier"),
  /** Shown on the public plans page. Internal plans (guest) are not listed. */
  listed: boolean("listed").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  tagline: text("tagline"),
  /** Marketing bullet list (display only; limits above are what is enforced). */
  features: jsonb("features").$type<string[]>().default([]).notNull(),
  /** Price in US cents per period; NULL = not purchasable (free / internal plans). */
  priceMonthlyCents: integer("price_monthly_cents"),
  priceYearlyCents: integer("price_yearly_cents"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

/** Explicit plan of an account; absent = the default registered plan (`free`). */
export const userPlans = pgTable("user_plans", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  /** End of paid access; NULL = does not expire (manual/admin assignment). */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const usageCounters = pgTable("usage_counters", {
  subjectKey: text("subject_key").primaryKey(),
  strategiesCreated: integer("strategies_created").default(0).notNull(),
  backtestsTotal: integer("backtests_total").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const usageDaily = pgTable(
  "usage_daily",
  {
    subjectKey: text("subject_key").notNull(),
    day: date("day").notNull(),
    backtests: integer("backtests").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.subjectKey, t.day] })],
).enableRLS();

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** `u:<userId>` or `g:<guestId>`. */
    ownerKey: text("owner_key").notNull(),
    name: text("name").notNull(),
    /** Everything else of the strategy (capital, fee, rules, recommendations). */
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("strategies_owner_idx").on(t.ownerKey),
    uniqueIndex("strategies_owner_name_uq").on(t.ownerKey, sql`lower(${t.name})`),
  ],
).enableRLS();

/** Digests of the backtests a subject has paid for: re-running one of them is free. */
export const backtestRuns = pgTable(
  "backtest_runs",
  {
    subjectKey: text("subject_key").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.subjectKey, t.requestHash] })],
).enableRLS();
