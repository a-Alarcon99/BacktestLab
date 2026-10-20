import { apiFetch } from "@/lib/api"
import type { Locale } from "@/lib/i18n"

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

export const rangePresets = ["1M", "3M", "6M", "1A", "3A", "Máx."] as const
export type RangePreset = (typeof rangePresets)[number]

const presetMonths: Record<Exclude<RangePreset, "Máx.">, number> = { "1M": 1, "3M": 3, "6M": 6, "1A": 12, "3A": 36 }

/**
 * Text shown for each preset. The values themselves stay as they are in every language: they are
 * stored in the user's strategies (`recommendedRange`).
 */
export const rangePresetLabels: Record<Locale, Record<RangePreset, string>> = {
  es: { "1M": "1M", "3M": "3M", "6M": "6M", "1A": "1A", "3A": "3A", "Máx.": "Máx." },
  en: { "1M": "1M", "3M": "3M", "6M": "6M", "1A": "1Y", "3A": "3Y", "Máx.": "Max" },
}

/** Start date (YYYY-MM-DD) of a preset ending `today`, clamped to the asset's available history. */
export function presetFrom(preset: RangePreset, today: string, historySince: string) {
  if (preset === "Máx.") return historySince
  const d = new Date(today)
  d.setUTCMonth(d.getUTCMonth() - presetMonths[preset])
  const from = d.toISOString().slice(0, 10)
  return from > historySince ? from : historySince
}

export type Candle = {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Price chart candles: the API picks the window for each timeframe (7 days of 1h … full history of
 * 1M). With `before` (open time of the oldest candle already loaded) it returns the page of
 * candles preceding it, empty once the first candle of the asset has been reached.
 */
export function fetchCandles(symbol: string, timeframe: Timeframe, before?: string): Promise<Candle[]> {
  const params = new URLSearchParams({ timeframe })
  if (before) params.set("before", before)
  return apiFetch<Candle[]>(`/assets/${encodeURIComponent(symbol)}/candles?${params}`)
}
