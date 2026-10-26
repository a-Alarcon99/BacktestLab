import type { Tone } from "./backtest-report.ts"
import type { BatchItem, AssetsBatchResult } from "./backtests.ts"

// Pure logic of the multi-asset run: summary figures, the consistency verdict, the sortable table
// and the timeline helpers the animation draws from. Only type imports and relative `.ts` imports,
// so `node --test` can load it; texts live in the components (this returns codes, tones, numbers).

const DAY_MS = 86_400_000

// --- Summary and verdict -----------------------------------------------------------------------

export type BatchSummary = {
  /** Assets asked for. */
  total: number
  /** Assets that produced a result. */
  ran: number
  failed: number
  profitable: number
  /** Assets where the strategy ended above buying and holding. */
  beatsHold: number
  /** Assets whose history began after the requested start. */
  lateStarts: number
  meanReturnPct: number | null
  medianReturnPct: number | null
  best: { symbol: string; returnPct: number } | null
  worst: { symbol: string; returnPct: number } | null
  meanDrawdownPct: number | null
  meanWinRatePct: number | null
  meanSharpe: number | null
  meanExposurePct: number | null
  totalOrders: number
  /** Asset with the best Sharpe ratio and the one that fell the least. */
  bestSharpe: { symbol: string; sharpe: number } | null
  shallowest: { symbol: string; drawdownPct: number } | null
}

const average = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null)

const median = (values: number[]) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function batchSummary(result: AssetsBatchResult, requestedFrom: string): BatchSummary {
  const ran = result.items.filter((item): item is BatchItem & { result: NonNullable<BatchItem["result"]> } => item.result !== null)
  const returns = ran.map((item) => ({ symbol: item.symbol, returnPct: item.result.stats.returnPct }))
  const byReturn = [...returns].sort((a, b) => b.returnPct - a.returnPct)
  const from = Date.parse(requestedFrom)
  return {
    total: result.items.length,
    ran: ran.length,
    failed: result.items.length - ran.length,
    profitable: ran.filter((item) => item.result.stats.returnPct > 0).length,
    beatsHold: ran.filter((item) => item.result.stats.returnPct > item.result.stats.benchmarkReturnPct).length,
    // A first candle within the first day still counts as starting on time.
    lateStarts: ran.filter((item) => item.startsAt !== null && Date.parse(item.startsAt) - from >= DAY_MS).length,
    meanReturnPct: returns.length ? returns.reduce((sum, r) => sum + r.returnPct, 0) / returns.length : null,
    medianReturnPct: median(returns.map((r) => r.returnPct)),
    best: byReturn[0] ?? null,
    worst: byReturn.at(-1) ?? null,
    meanDrawdownPct: average(ran.map((item) => item.result.stats.maxDrawdownPct)),
    meanWinRatePct: average(ran.map((item) => item.result.stats.winRatePct)),
    meanSharpe: average(ran.map((item) => item.result.stats.sharpe)),
    meanExposurePct: average(ran.map((item) => item.result.metrics.exposurePct)),
    totalOrders: ran.reduce((sum, item) => sum + item.result.stats.trades, 0),
    bestSharpe: ran.length ? ran.map((item) => ({ symbol: item.symbol, sharpe: item.result.stats.sharpe })).sort((a, b) => b.sharpe - a.sharpe)[0] : null,
    shallowest: ran.length ? ran.map((item) => ({ symbol: item.symbol, drawdownPct: item.result.stats.maxDrawdownPct })).sort((a, b) => a.drawdownPct - b.drawdownPct)[0] : null,
  }
}

export type ConsistencyHeadline =
  /** Nothing ran. */
  | "none"
  /** Profitable in at least 80 % of the assets and ahead of buy and hold in half. */
  | "consistent"
  | "mostly"
  | "mixed"
  | "fragile"
  /** Profitable in at most 20 %. */
  | "loses"

export type Consistency = {
  headline: ConsistencyHeadline
  tone: Tone
  profitable: number
  beatsHold: number
  ran: number
  /** Too few assets to call it consistent either way. */
  smallSample: boolean
}

export const SMALL_SAMPLE = 3

export function consistency(summary: BatchSummary): Consistency {
  const { ran, profitable, beatsHold } = summary
  const base = { profitable, beatsHold, ran, smallSample: ran < SMALL_SAMPLE }
  if (ran === 0) return { ...base, headline: "none", tone: "bad" }
  const wins = profitable / ran
  const ahead = beatsHold / ran
  if (wins >= 0.8 && ahead >= 0.5) return { ...base, headline: "consistent", tone: "good" }
  if (wins >= 0.6) return { ...base, headline: "mostly", tone: "mixed" }
  if (wins >= 0.4) return { ...base, headline: "mixed", tone: "mixed" }
  if (wins > 0.2) return { ...base, headline: "fragile", tone: "bad" }
  return { ...base, headline: "loses", tone: "bad" }
}

// --- Table -------------------------------------------------------------------------------------

export type BatchRow = {
  symbol: string
  /** Position in the request (the default order). */
  order: number
  ran: boolean
  returnPct: number
  benchmarkReturnPct: number
  /** Return minus buy and hold's, in points. */
  excessPct: number
  maxDrawdownPct: number
  winRatePct: number
  sharpe: number
  trades: number
  finalCapital: number
  profitFactor: number | null
  exposurePct: number
  startsAt: string | null
}

export type SortKey =
  | "order"
  | "symbol"
  | "returnPct"
  | "benchmarkReturnPct"
  | "excessPct"
  | "maxDrawdownPct"
  | "winRatePct"
  | "sharpe"
  | "trades"
  | "finalCapital"
  | "profitFactor"
  | "exposurePct"

export function batchRows(result: AssetsBatchResult): BatchRow[] {
  return result.items.map((item, order) => {
    const stats = item.result?.stats
    return {
      symbol: item.symbol,
      order,
      ran: stats !== undefined,
      returnPct: stats?.returnPct ?? 0,
      benchmarkReturnPct: stats?.benchmarkReturnPct ?? 0,
      excessPct: stats ? stats.returnPct - stats.benchmarkReturnPct : 0,
      maxDrawdownPct: stats?.maxDrawdownPct ?? 0,
      winRatePct: stats?.winRatePct ?? 0,
      sharpe: stats?.sharpe ?? 0,
      trades: stats?.trades ?? 0,
      finalCapital: stats?.finalCapital ?? 0,
      profitFactor: item.result?.metrics.profitFactor ?? null,
      exposurePct: item.result?.metrics.exposurePct ?? 0,
      startsAt: item.startsAt,
    }
  })
}

/** Sorted copy; assets that could not run always go last. Ties keep the requested order. */
export function sortRows(rows: BatchRow[], key: SortKey, direction: "asc" | "desc"): BatchRow[] {
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    if (a.ran !== b.ran) return a.ran ? -1 : 1
    const x = a[key]
    const y = b[key]
    const diff = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : Number(x) - Number(y)
    return diff === 0 ? a.order - b.order : sign * diff
  })
}

// --- Timeline (the animation) ------------------------------------------------------------------

/** An equity curve against time. `t` is in ms, ascending. */
export type Series = { t: number[]; equity: number[] }

export function seriesOf(item: BatchItem): Series | null {
  const r = item.result
  if (!r) return null
  return { t: r.candles.map((c) => Date.parse(c.time)), equity: r.equity }
}

/** Index of the last point at or before time `t`, or `null` before the series begins. */
export function indexAt(series: Series, t: number): number | null {
  let lo = 0
  let hi = series.t.length - 1
  if (hi < 0 || t < series.t[0]) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (series.t[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Equity at time `t` (the last point at or before it), or `null` before the series begins. */
export function valueAt(series: Series, t: number): number | null {
  const i = indexAt(series, t)
  return i === null ? null : series.equity[i]
}

/** Return % of `value` over `capital`. */
export const returnPctOf = (value: number, capital: number) => (value / capital - 1) * 100

/** Rank of each value, 0 = highest. `null`s rank last; ties keep their index order. */
export function ranksOf(values: (number | null)[]): number[] {
  const order = values
    .map((value, i) => ({ value, i }))
    .sort((a, b) => {
      if ((a.value === null) !== (b.value === null)) return a.value === null ? 1 : -1
      return (b.value ?? 0) - (a.value ?? 0) || a.i - b.i
    })
  const ranks = new Array<number>(values.length)
  order.forEach(({ i }, rank) => (ranks[i] = rank))
  return ranks
}

/**
 * Rank positions that glide: the average of the ranks over the last `window` units of `pos`.
 * A pure function of `pos`, so seeking, pausing and replaying never leave bars in a stale place.
 */
export function smoothRanks(valuesAt: (pos: number) => (number | null)[], pos: number, window: number, samples = 6): number[] {
  const sums: number[] = []
  for (let s = 0; s < samples; s++) {
    const ranks = ranksOf(valuesAt(Math.max(0, pos - (window * s) / (samples - 1))))
    ranks.forEach((rank, i) => (sums[i] = (sums[i] ?? 0) + rank))
  }
  return sums.map((sum) => sum / samples)
}

// --- CSV ---------------------------------------------------------------------------------------

/**
 * The table as CSV for spreadsheets (same conventions as `tradesCsv`: `;` and a decimal comma in
 * Spanish, `,` and a point in English, BOM first). Assets that could not run keep only their name.
 */
export function batchCsv(rows: BatchRow[], locale: "es" | "en", headers: string[]) {
  const sep = locale === "es" ? ";" : ","
  const num = (v: number, digits: number) => (locale === "es" ? v.toFixed(digits).replace(".", ",") : v.toFixed(digits))
  const cell = (value: string) => (value.includes(sep) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  const body = rows.map((r) =>
    (r.ran
      ? [r.symbol, num(r.returnPct, 2), num(r.benchmarkReturnPct, 2), num(r.excessPct, 2), num(r.maxDrawdownPct, 2), num(r.winRatePct, 1), num(r.sharpe, 2), String(r.trades), num(r.finalCapital, 2), r.profitFactor === null ? "" : num(r.profitFactor, 2), num(r.exposurePct, 1), r.startsAt?.slice(0, 10) ?? ""]
      : [r.symbol, "", "", "", "", "", "", "", "", "", "", ""]
    )
      .map(cell)
      .join(sep)
  )
  const eol = "\r\n"
  return `﻿${[headers.map(cell).join(sep), ...body].join(eol)}${eol}`
}
