import { asc, eq } from "drizzle-orm"
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
