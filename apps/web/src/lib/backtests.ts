import { refreshMe } from "@/lib/session"
import { defaultLocale, translator, type Locale } from "@/lib/i18n"
import { describeWebError, webFetch, WebApiError } from "@/lib/web-api"
import type { Timeframe } from "@/lib/candles"
import type { Strategy } from "@/lib/strategy"

// Client-safe: backtest request/result types (mirror `app/schemas/backtest.py`) and the saved
// summary of a run.

/** Runs kept in the history when the plan doesn't say otherwise (the plan's `historySize` wins). */
export const MAX_BACKTESTS = 10

export type BacktestRequest = {
  symbol: string
  timeframe: Timeframe
  /** Inclusive range of whole UTC days, YYYY-MM-DD. */
  from: string
  to: string
  strategy: Strategy
}

export type ReplayCandle = { time: string; open: number; high: number; low: number; close: number }

export type BacktestTrade = {
  time: string
  /** Index in `BacktestResult.candles`. */
  index: number
  side: "buy" | "sell"
  price: number
  quantity: number
  /** USDT spent (buy) or received (sell), fees included. */
  amount: number
  pnl: number | null
  /** `Rule.id` of the strategy rule that placed the order. */
  ruleId: string
}

export type BacktestStats = {
  buys: number
  sells: number
  trades: number
  realizedPnl: number
  unrealizedPnl: number
  /** Percentages: 12.5 = +12.50%. */
  returnPct: number
  winRatePct: number
  /** Positive: 21.4 = −21.4%. */
  maxDrawdownPct: number
  sharpe: number
  finalCapital: number
  openPosition: boolean
}

export type BacktestResult = {
  /** Real number of candles simulated; `candles` is downsampled for the animation. */
  candleCount: number
  candles: ReplayCandle[]
  trades: BacktestTrade[]
  /** Per display candle, cumulative up to and including it. */
  buys: number[]
  sells: number[]
  realized: number[]
  equity: number[]
  /** Short equity curve normalized to 100. */
  equityCurve: number[]
  stats: BacktestStats
}

/** Saved summary of a run. The full result is not stored: reviewing re-runs it (deterministic). */
export type BacktestRecord = {
  schemaVersion: 1
  id: string
  /** ISO timestamp of the run. */
  executedAt: string
  symbol: string
  timeframe: Timeframe
  from: string
  to: string
  /** Snapshot: editing or deleting the strategy doesn't change the history. */
  strategy: Strategy
  stats: Pick<BacktestStats, "returnPct" | "maxDrawdownPct" | "sharpe" | "winRatePct" | "trades" | "finalCapital">
  equity: number[]
}

/**
 * Runs through this app's server, which checks and consumes the plan quota before calling the
 * engine; the engine itself rejects calls that don't come from it.
 */
export async function runBacktest(request: BacktestRequest, signal?: AbortSignal): Promise<BacktestResult> {
  try {
    return await webFetch<BacktestResult>("/api/backtests/run", {
      method: "POST",
      body: JSON.stringify(request),
      signal,
    })
  } finally {
    // The quota may have changed (consumed, refunded or exhausted).
    if (!signal?.aborted) void refreshMe()
  }
}

export function recordFromResult(request: BacktestRequest, result: BacktestResult): BacktestRecord {
  const { returnPct, maxDrawdownPct, sharpe, winRatePct, trades, finalCapital } = result.stats
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    executedAt: new Date().toISOString(),
    ...request,
    stats: { returnPct, maxDrawdownPct, sharpe, winRatePct, trades, finalCapital },
    equity: result.equityCurve,
  }
}

/** User-facing message for a failed run. */
export function describeBacktestError(error: unknown, locale: Locale = defaultLocale) {
  const t = translator(locale)
  if (!(error instanceof WebApiError))
    return t("No se pudo conectar con el servidor de backtesting.", "Couldn't reach the backtesting server.")
  if (error.status === 429) return describeWebError(error, locale, error.message)
  if (error.code === "engine_misconfigured")
    return t(
      "El motor de backtesting no acepta las peticiones de la web (revisa INTERNAL_API_KEY en ambas apps).",
      "The backtesting engine rejects the website's requests (check INTERNAL_API_KEY in both apps)."
    )
  if (error.status === 403)
    return t(
      "Petición bloqueada por origen. Abre la web desde la URL configurada en NEXT_PUBLIC_APP_URL.",
      "Request blocked by origin. Open the website from the URL set in NEXT_PUBLIC_APP_URL."
    )
  if (error.status === 502 || error.status === 503)
    return t(error.message, "The backtesting engine isn't available right now. Try again in a few seconds.")
  if (error.status === 404) return t("El activo no existe o no está disponible.", "The asset doesn't exist or isn't available.")
  if (error.status === 422) {
    const { detail } = error
    if (typeof detail === "string") {
      return detail === "Not enough candles in the range" || detail === "The range must be at least 1 day"
        ? t(
            "No hay suficientes velas en el rango elegido. Amplía las fechas o usa una temporalidad menor.",
            "There aren't enough candles in the chosen range. Widen the dates or use a smaller timeframe."
          )
        : detail
    }
    if (Array.isArray(detail) && detail.every((d) => typeof d === "string")) return detail.join(" ")
    return t("La estrategia o los parámetros del backtest no son válidos.", "The strategy or the backtest parameters aren't valid.")
  }
  return t("El servidor de backtesting ha fallado. Inténtalo de nuevo.", "The backtesting server failed. Try again.")
}

/** `true` when the failure is a quota limit (the UI offers to sign up / shows the plan). */
export const isLimitError = (error: unknown) => error instanceof WebApiError && error.code === "limit_reached"
