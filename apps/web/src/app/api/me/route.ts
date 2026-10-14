import { and, eq, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { strategies } from "@/db/schema";
import { readGuestId, resolveIdentity } from "@/lib/server/identity";
import { readUsage } from "@/lib/server/quota";

/** Moves the strategies a visitor created as a guest to the account they just signed in to. */
async function adoptGuestStrategies(userKey: string) {
  const guestId = await readGuestId();
  if (!guestId) return;
  const mine = alias(strategies, "mine");
  const moved = await db
    .update(strategies)
    .set({ ownerKey: userKey })
    .where(
      and(
        eq(strategies.ownerKey, `g:${guestId}`),
        notExists(
          db
            .select({ one: sql`1` })
            .from(mine)
            .where(and(eq(mine.ownerKey, userKey), sql`lower(${mine.name}) = lower(${strategies.name})`)),
        ),
      ),
    )
    .returning({ id: strategies.id });
  if (moved.length > 0) {
    await db.execute(sql`
      insert into usage_counters (subject_key, strategies_created) values (${userKey}, ${moved.length})
      on conflict (subject_key) do update
        set strategies_created = usage_counters.strategies_created + ${moved.length}, updated_at = now()`);
  }
}

/** Who the caller is, their plan limits and how much of them is used. */
export async function GET() {
  const identity = await resolveIdentity();
  if (identity.kind === "user") await adoptGuestStrategies(identity.key);
  const usage = await readUsage(identity);
  const { plan } = identity;
  return Response.json(
    {
      user: identity.user ?? null,
      plan: {
        id: plan.id,
        name: plan.name,
        maxStrategies: plan.maxStrategies,
        maxBacktestsTotal: plan.maxBacktestsTotal,
        maxBacktestsPerDay: plan.maxBacktestsPerDay,
        historySize: plan.historySize,
      },
      usage,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
