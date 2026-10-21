import { asc, eq, inArray } from "drizzle-orm"
import { cacheLife } from "next/cache"
import { db } from "@/db"
import { plans } from "@/db/schema"

/** A plan as shown on the public plans page. Limits mirror the `plans` row (`null` = unlimited). */
export type PublicPlan = {
  id: string
  name: string
  tagline: string | null
  features: string[]
  maxStrategies: number | null
  maxBacktestsPerDay: number | null
  historySize: number
  /** US cents; `null` = not purchasable (free plan). */
  priceMonthlyCents: number | null
  priceYearlyCents: number | null
}

/**
 * Listed plans, in display order. Display only (cached for a while): quotas are always enforced
 * from the `plans` row itself in `lib/server/identity.ts`.
 */
export async function getPublicPlans(): Promise<PublicPlan[]> {
  "use cache"
  cacheLife("hours")
  const rows = await db.select().from(plans).where(eq(plans.listed, true)).orderBy(asc(plans.sortOrder))
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    features: p.features,
    maxStrategies: p.maxStrategies,
    maxBacktestsPerDay: p.maxBacktestsPerDay,
    historySize: p.historySize,
    priceMonthlyCents: p.priceMonthlyCents,
    priceYearlyCents: p.priceYearlyCents,
  }))
}

/** Limits of a plan for display (`null` = unlimited). */
export type PlanLimits = {
  maxBacktestsTotal: number | null
  maxBacktestsPerDay: number | null
  maxStrategies: number | null
}

/**
 * What anonymous visitors (`guest`) and free accounts (`free`) can do, for the marketing copy.
 * Display only, cached like the catalog; `undefined` if a row is missing.
 */
export async function getStarterLimits(): Promise<{ guest?: PlanLimits; free?: PlanLimits }> {
  "use cache"
  cacheLife("hours")
  const rows = await db
    .select({
      id: plans.id,
      maxBacktestsTotal: plans.maxBacktestsTotal,
      maxBacktestsPerDay: plans.maxBacktestsPerDay,
      maxStrategies: plans.maxStrategies,
    })
    .from(plans)
    .where(inArray(plans.id, ["guest", "free"]))
  const byId = Object.fromEntries(rows.map(({ id, ...limits }) => [id, limits]))
  return { guest: byId.guest, free: byId.free }
}
