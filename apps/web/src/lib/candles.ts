import { apiFetch } from "@/lib/api"

// Client-safe: no database or `next/cache` imports, so client components can use it.

/** Timeframes supported by the backtest (1h candles are stored; the rest are resampled). */
export const timeframes = ["1h", "4h", "1d", "1w", "1M"] as const
export type Timeframe = (typeof timeframes)[number]

export const defaultTimeframe: Timeframe = "4h"

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
