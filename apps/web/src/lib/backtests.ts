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
  /** Open time of the candle the order filled on, at its open price. */
  time: string
  /** Open time of the candle whose close gave the signal (the candle before `time`). */
  signalTime: string
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
  /** Index in `BacktestResult.roundTrips` of the trade this order belongs to. */
  roundTrip: number
}

export type BacktestStats = {
  /** Orders. */
  buys: number
  sells: number
  trades: number
  /** Closed trades (from flat to flat): the unit of the win rate. */
  roundTrips: number
  realizedPnl: number
  /** Open position valued as sold at the last close (fee deducted). */
  unrealizedPnl: number
  /** Percentages: 12.5 = +12.50%. */
  returnPct: number
  benchmarkReturnPct: number
  winRatePct: number
  /** Positive: 21.4 = −21.4%. */
  maxDrawdownPct: number
  sharpe: number
  finalCapital: number
  openPosition: boolean
}

/** One trade from flat to flat; an open one is valued at the last close (exit fee deducted). */
export type RoundTrip = {
  /** Display indices (in `candles`) of the first buy and the closing sell (last candle if open). */
  entryIndex: number
  exitIndex: number
  entryTime: string
  exitTime: string | null
  /** Average fill prices, fees excluded; `exitPrice` is the last close while open. */
  entryPrice: number
  exitPrice: number
  /** USDT spent on the buys, fees included. */
  invested: number
  pnl: number
  pnlPct: number
  bars: number
  durationSeconds: number
  exitRuleId: string | null
  open: boolean
  /** Deepest fall of the price below the entry while held (≤ 0, %). */
  worstPct: number
  buys: number
  sells: number
}

export type DrawdownPeriod = {
  startIndex: number
  endIndex: number
  startTime: string
  endTime: string
  candles: number
  seconds: number
  /** False when the equity never got back to the peak. */
  recovered: boolean
  depthPct: number
}

export type PeriodUnit = "day" | "week" | "month" | "quarter" | "year"

export type PeriodReturns = {
  unit: PeriodUnit
  items: { start: string; returnPct: number; benchmarkPct: number }[]
}

/** Report figures, computed by the engine at full resolution; `null` = not defined for this run. */
export type BacktestMetrics = {
  days: number
  netProfit: number
  returnPct: number
  benchmarkReturnPct: number
  /** Return minus buy and hold's, in percentage points. */
  excessReturnPct: number
  maxDrawdownPct: number
  benchmarkMaxDrawdownPct: number
  /** Display index of the bottom of the deepest drawdown. */
  maxDrawdownIndex: number | null
  longestDrawdown: DrawdownPeriod | null
  roundTrips: number
  wins: number
  losses: number
  winRatePct: number
  profitFactor: number | null
  avgWinPct: number | null
  avgLossPct: number | null
  payoffRatio: number | null
  expectancyPct: number | null
  expectancyUsdt: number | null
  bestTradePct: number | null
  worstTradePct: number | null
  /** Share of the closed trades' gross profit made by the best one (%). */
  bestTradeSharePct: number | null
  maxWinStreak: number
  maxLossStreak: number
  avgBars: number | null
  avgDurationSeconds: number | null
  /** Candles with an open position, % of the range. */
  exposurePct: number
  feesPaid: number
  tradesPerMonth: number
  cagrPct: number | null
  sharpe: number | null
  sortino: number | null
  calmar: number | null
  volatilityPct: number | null
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
  /** Liquidation value at the end of each display candle; `benchmark` = buy at the first open and hold. */
  equity: number[]
  benchmark: number[]
  /** Deepest fall below the previous peak inside each display candle (%, positive). */
  drawdown: number[]
  benchmarkDrawdown: number[]
  /** Short equity curve normalized to 100. */
  equityCurve: number[]
  roundTrips: RoundTrip[]
  periods: PeriodReturns
  metrics: BacktestMetrics
  stats: BacktestStats
}

type RecordStatsV1 = Pick<BacktestStats, "returnPct" | "maxDrawdownPct" | "sharpe" | "winRatePct" | "trades" | "finalCapital">

/**
 * Saved summary of a run. The full result is not stored: reviewing re-runs it (deterministic).
 * Version 1 records were computed by the previous engine (fills at the signal's close, no exit
 * fee); they are still listed but never compared with new runs.
 */
export type BacktestRecord = {
  id: string
  /** ISO timestamp of the run. */
  executedAt: string
  symbol: string
  timeframe: Timeframe
  from: string
  to: string
  /** Snapshot: editing or deleting the strategy doesn't change the history. */
  strategy: Strategy
  equity: number[]
} & (
  | { schemaVersion: 1; stats: RecordStatsV1 }
  | {
      schemaVersion: 2
      stats: RecordStatsV1 & {
        benchmarkReturnPct: number
        profitFactor: number | null
        roundTrips: number
        exposurePct: number
      }
    }
)

export type BacktestRecordV2 = Extract<BacktestRecord, { schemaVersion: 2 }>

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

export function recordFromResult(request: BacktestRequest, result: BacktestResult): BacktestRecordV2 {
  const { returnPct, maxDrawdownPct, sharpe, winRatePct, trades, finalCapital, benchmarkReturnPct, roundTrips } = result.stats
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    executedAt: new Date().toISOString(),
    ...request,
    stats: {
      returnPct,
      maxDrawdownPct,
      sharpe,
      winRatePct,
      trades,
      finalCapital,
      benchmarkReturnPct,
      roundTrips,
      profitFactor: result.metrics.profitFactor,
      exposurePct: result.metrics.exposurePct,
    },
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
