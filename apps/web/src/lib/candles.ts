import { apiFetch } from "@/lib/api"

// Client-safe: no database or `next/cache` imports, so client components can use it.

/** Timeframes supported by the backtest (1h candles are stored; the rest are resampled). */
export const timeframes = ["1h", "4h", "1d", "1w", "1M"] as const
export type Timeframe = (typeof timeframes)[number]

export const defaultTimeframe: Timeframe = "4h"

const HOUR_MS = 3_600_000
const timeframeMs: Record<Timeframe, number> = {
  "1h": HOUR_MS,
  "4h": 4 * HOUR_MS,
  "1d": 24 * HOUR_MS,
  "1w": 7 * 24 * HOUR_MS,
  "1M": 30.44 * 24 * HOUR_MS,
}

/** Approximate number of candles in [from, to] (both inclusive whole UTC days). */
export function estimateCandles(from: string, to: string, timeframe: Timeframe) {
  const span = Date.parse(to) - Date.parse(from) + 24 * HOUR_MS
  return Math.max(0, Math.floor(span / timeframeMs[timeframe]))
}

export type Candle = {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Price chart candles: the API picks the window for each timeframe (7 days of 1h … full history of 1M). */
export function fetchCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
  return apiFetch<Candle[]>(`/assets/${encodeURIComponent(symbol)}/candles?timeframe=${timeframe}`)
}
