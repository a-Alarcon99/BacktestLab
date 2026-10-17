import { asc, eq } from "drizzle-orm"
import { cacheLife } from "next/cache"
import { db } from "@/db"
import { assets, categories } from "@/db/schema"
import { ApiError, apiFetch } from "@/lib/api"
import { fetchCandles, type Candle, type Timeframe } from "@/lib/candles"

export { timeframes, type Candle, type Timeframe } from "@/lib/candles"

export type Asset = {
  symbol: string
  name: string
  /** Market cap rank (CoinGecko). */
  rank: number | null
  category: string
  price: number
  /** Percentages: 2.5 = +2.50%. */
  change24h: number
  change7d: number
  volume24h: number
  marketCap: number | null
  high24h: number
  low24h: number
  historySince: string
  updatedAt: string
}

/** The part of an asset that rarely changes: safe to prerender. */
export type AssetInfo = Pick<Asset, "symbol" | "name" | "category" | "historySince">

// Live market data: short-lived, so it is resolved at request time (wrap readers in <Suspense>).
const live = { stale: 30, revalidate: 30, expire: 120 }

export async function getAssets(): Promise<Asset[]> {
  "use cache"
  cacheLife(live)
  return apiFetch<Asset[]>("/assets")
}

/** `null` if the asset doesn't exist (404) or has no quote yet (503, before the first refresh). */
export async function getAsset(symbol: string): Promise<Asset | null> {
  "use cache"
  cacheLife(live)
  try {
    return await apiFetch<Asset>(`/assets/${encodeURIComponent(symbol)}`)
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 503)) return null
    throw error
  }
}

/**
 * `null` if the API fails: the chart then fetches the series from the browser, so neither a page
 * nor the build (which runs this while prerendering) depends on the API answering.
 */
export async function getPriceSeries(symbol: string, timeframe: Timeframe): Promise<Candle[] | null> {
  "use cache"
  cacheLife(live)
  try {
    return await fetchCandles(symbol, timeframe)
  } catch {
    return null
  }
}

/**
 * Asset catalog for routes, metadata and filters, read straight from Postgres: it is static data,
 * so it doesn't go through the API (which would also trigger a quote refresh with the providers).
 * Ordered by category, then catalog order. Prerendered; requires the database at build time.
 */
export async function getAssetCatalog(): Promise<AssetInfo[]> {
  "use cache"
  cacheLife("hours")
  return db
    .select({
      symbol: assets.symbol,
      name: assets.name,
      category: categories.name,
      historySince: assets.historySince,
    })
    .from(assets)
    .innerJoin(categories, eq(categories.id, assets.categoryId))
    .where(eq(assets.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(assets.id))
}

/** Today's UTC date (YYYY-MM-DD). Cached so prerendered pages can use it without dynamic IO. */
export async function getToday(): Promise<string> {
  "use cache"
  cacheLife("hours")
  return new Date().toISOString().slice(0, 10)
}

export async function getAssetInfo(symbol: string): Promise<AssetInfo | undefined> {
  const catalog = await getAssetCatalog()
  return catalog.find((a) => a.symbol.toLowerCase() === symbol.toLowerCase())
}
