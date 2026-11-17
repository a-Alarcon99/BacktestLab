import { refreshMe } from "@/lib/session"
import { defaultLocale, translator, type Locale } from "@/lib/i18n"
import { describeWebError, webFetch, WebApiError } from "@/lib/web-api"
import type { Timeframe } from "@/lib/candles"
import type { Tone } from "@/lib/backtest-report"
import { CENTRE, sensitivityReport, timeframesReport, windowsReport, type RobustTest } from "@/lib/robustness-report"
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

/** Same strategy over several assets, each with the full capital (mirror of `AssetsBatchRequest`). */
export type AssetsBatchRequest = {
  kind: "assets"
  symbols: string[]
  timeframe: Timeframe
  from: string
  to: string
  strategy: Strategy
}

export type BatchItem = {
  symbol: string
  /** Absent when the asset could not run. */
  result: BacktestResult | null
  /** "no-candles": not enough candles in the range for this asset. */
  error: "no-candles" | null
  /** First candle simulated; later than the requested start when the asset's history begins later. */
  startsAt: string | null
}

export type AssetsBatchResult = { kind: "assets"; items: BatchItem[] }

/** Figures of one simulation of a robustness test, without the replay data (mirror of `RunSummary`). */
export type RunSummary = {
  returnPct: number
  benchmarkReturnPct: number
  maxDrawdownPct: number
  orders: number
  roundTrips: number
  winRatePct: number
  sharpe: number
  candleCount: number
  finalCapital: number
  /** `null` when it is not defined (no losing trade, no closed trade). */
  profitFactor: number | null
  /** Candles with an open position, % of the range. */
  exposurePct: number
  avgTradePct: number | null
  bestTradePct: number | null
  worstTradePct: number | null
  /** Equity of the strategy and of buying and holding, normalized to 100, at evenly spaced points. */
  curve: number[]
  benchmarkCurve: number[]
  /** Fall below the previous peak (%, positive) of the strategy at the same points. */
  drawdownCurve: number[]
  /** Orders as a fraction (0-1) of the run. */
  marks: { at: number; side: "buy" | "sell" }[]
}

type RobustBase = { symbol: string; timeframe: Timeframe; from: string; to: string; strategy: Strategy }

/** Rolling windows: the strategy restarts with the full capital on each slice of the range. */
export type WindowsBatchRequest = RobustBase & { kind: "windows"; lengthDays: number; stepDays: number }
export type WindowsBatchResult = {
  kind: "windows"
  lengthDays: number
  stepDays: number
  items: { start: string; end: string; summary: RunSummary | null; error: "no-candles" | null }[]
  /** The asset's close over the whole range, to draw the windows against. */
  prices: { time: string; close: number }[]
}

/**
 * The strategy with one or two of its parameters varied (±20 % unless `values` says otherwise).
 * `params` are `sensitivityParams` ids; `values` the five values to try of each, same order.
 */
export type SensitivityBatchRequest = RobustBase & { kind: "sensitivity"; params: string[]; values?: number[][] }
export type SensitivityBatchResult = {
  kind: "sensitivity"
  axes: {
    id: string
    kind: string
    field: string
    ruleIndex: number
    conditionIndex: number
    base: number
    values: number[]
    levels: number[]
  }[]
  /** The last axis varies fastest. */
  cells: {
    coords: number[]
    values: number[]
    summary: RunSummary | null
    error: "invalid" | "conflict" | "no-candles" | null
  }[]
}

/** The same range on the timeframe asked for and on `timeframes` (the ones next to it when omitted). */
export type TimeframesBatchRequest = RobustBase & { kind: "timeframes"; timeframes?: Timeframe[] }
export type TimeframesBatchResult = {
  kind: "timeframes"
  items: { timeframe: Timeframe; summary: RunSummary | null; error: "no-candles" | null; startsAt: string | null }[]
}

export type RobustRequest = WindowsBatchRequest | SensitivityBatchRequest | TimeframesBatchRequest
export type RobustResult = WindowsBatchResult | SensitivityBatchResult | TimeframesBatchResult

/** Percentiles, point by point, of the equity (normalized to 100) of many paths. */
export type McBands = { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }

/** Monte Carlo on synthetic price paths made of blocks of the real candles (mirror of `McPathsBatchRequest`). */
export type McPathsBatchRequest = RobustBase & {
  kind: "mc-paths"
  paths: number
  /** Consecutive candles moved together; the engine picks about the square root of the candles when absent. */
  blockLength?: number
  /** Absent = derived from the request, so the same request always gives the same paths. */
  seed?: number
}
export type McPathsBatchResult = {
  kind: "mc-paths"
  runs: number
  blockLength: number
  seed: number
  candleCount: number
  real: { returnPct: number; benchmarkReturnPct: number; maxDrawdownPct: number; curve: number[] }
  /** A few whole paths, on the same points as the bands. */
  samples: number[][]
  bands: McBands
  /** The bands once the first `runs` paths are in (the animation settles through these). */
  checkpoints: { runs: number; bands: McBands }[]
  /** Final return and deepest drawdown (%) of every path. */
  returns: number[]
  drawdowns: number[]
  /** Share (%) of the paths that beat buying and holding on their own candles. */
  beatHoldPct: number
}

export type BatchRequest = AssetsBatchRequest | RobustRequest | McPathsBatchRequest
export type BatchResult = AssetsBatchResult | RobustResult | McPathsBatchResult
/** The result type that goes with a request kind. */
export type ResultOf<R extends BatchRequest> = Extract<BatchResult, { kind: R["kind"] }>

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
 * Saved summary of a multi-asset run: one history entry for the whole group. Reopening it re-runs
 * the batch, which is free (same digest as the paid one).
 */
export type BatchRecord = {
  kind: "batch"
  id: string
  executedAt: string
  timeframe: Timeframe
  from: string
  to: string
  strategy: Strategy
  /** In the order the user chose them. */
  symbols: string[]
  items: {
    symbol: string
    /** `null` when the asset could not run. */
    stats: { returnPct: number; benchmarkReturnPct: number; maxDrawdownPct: number; trades: number } | null
    equity: number[]
  }[]
}

/**
 * Saved summary of a robustness test (windows, sensitivity, timeframes): one entry per test.
 * Reopening it re-runs the test, free because the server recognizes its digest.
 */
export type RobustRecord = {
  kind: "robust"
  test: RobustTest
  id: string
  executedAt: string
  symbol: string
  timeframe: Timeframe
  from: string
  to: string
  strategy: Strategy
  /** What the test adds to the usual request (`lengthDays`/`stepDays` or `params`), to run it again. */
  options: { lengthDays?: number; stepDays?: number; params?: string[]; values?: number[][]; timeframes?: Timeframe[] }
  score: number
  tone: Tone
  /** Report code ("consistent", "plateau", …), see `robustness-report.ts`. */
  headline: string
  /** Simulations that ran, and how many came out ahead. */
  ran: number
  positive: number
  /** A short curve for the list: the strategy on the first window / the original variant / the chosen timeframe. */
  curve: number[]
}

/** What the history holds: single-asset runs, multi-asset groups and robustness tests. */
export type HistoryRecord = BacktestRecord | BatchRecord | RobustRecord

export const isBatchRecord = (record: HistoryRecord): record is BatchRecord => "kind" in record && record.kind === "batch"
export const isRobustRecord = (record: HistoryRecord): record is RobustRecord => "kind" in record && record.kind === "robust"
/** Single-asset runs (what `ReplayPlayer` reviews). */
export const isSingleRecord = (record: HistoryRecord): record is BacktestRecord => !("kind" in record)

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

/** Same quota path as a single run, charged one backtest per asset (the server counts them). */
export async function runBatch<R extends BatchRequest>(request: R, signal?: AbortSignal): Promise<ResultOf<R>> {
  try {
    return await webFetch<ResultOf<R>>("/api/backtests/batch", {
      method: "POST",
      body: JSON.stringify(request),
      signal,
    })
  } finally {
    if (!signal?.aborted) void refreshMe()
  }
}

export function recordFromBatch(request: AssetsBatchRequest, result: AssetsBatchResult): BatchRecord {
  return {
    kind: "batch",
    id: crypto.randomUUID(),
    executedAt: new Date().toISOString(),
    timeframe: request.timeframe,
    from: request.from,
    to: request.to,
    strategy: request.strategy,
    symbols: request.symbols,
    items: request.symbols.map((symbol) => {
      const item = result.items.find((i) => i.symbol === symbol.toUpperCase())
      const r = item?.result
      return {
        symbol,
        stats: r
          ? { returnPct: r.stats.returnPct, benchmarkReturnPct: r.stats.benchmarkReturnPct, maxDrawdownPct: r.stats.maxDrawdownPct, trades: r.stats.trades }
          : null,
        equity: r?.equityCurve ?? [],
      }
    }),
  }
}

/** The request that produced a saved robustness test (to run it again, or to tell the server to forget it). */
export function requestOfRobust(record: RobustRecord): RobustRequest {
  const base = { symbol: record.symbol, timeframe: record.timeframe, from: record.from, to: record.to, strategy: record.strategy }
  if (record.test === "windows") return { ...base, kind: "windows", lengthDays: record.options.lengthDays ?? 0, stepDays: record.options.stepDays ?? 0 }
  if (record.test === "sensitivity") return { ...base, kind: "sensitivity", params: record.options.params ?? [], ...(record.options.values ? { values: record.options.values } : {}) }
  return { ...base, kind: "timeframes", ...(record.options.timeframes ? { timeframes: record.options.timeframes } : {}) }
}

/** History entry of a robustness test: the figures a list row shows, not the whole result. */
export function recordFromRobust(request: RobustRequest, result: RobustResult): RobustRecord {
  const { kind: test, symbol, timeframe, from, to, strategy } = request
  const common = { kind: "robust" as const, test, id: crypto.randomUUID(), executedAt: new Date().toISOString(), symbol: symbol.toUpperCase(), timeframe, from, to, strategy }
  if (request.kind === "windows" && result.kind === "windows") {
    const report = windowsReport(result)
    const first = result.items.find((i) => i.summary)?.summary
    return { ...common, options: { lengthDays: request.lengthDays, stepDays: request.stepDays }, score: report.score, tone: report.tone, headline: report.headline, ran: report.ran, positive: report.positive, curve: first?.curve ?? [] }
  }
  if (request.kind === "sensitivity" && result.kind === "sensitivity") {
    const report = sensitivityReport(result)
    const base = result.cells.find((c) => c.coords.every((k) => k === CENTRE))?.summary
    return { ...common, options: { params: request.params, ...(request.values ? { values: request.values } : {}) }, score: report.score, tone: report.tone, headline: report.headline, ran: report.ran, positive: report.profitable, curve: base?.curve ?? [] }
  }
  if (result.kind !== "timeframes") throw new Error("Mismatched robustness result")
  const report = timeframesReport(result, timeframe)
  const chosen = result.items.find((i) => i.timeframe === timeframe)?.summary
  return { ...common, options: request.kind === "timeframes" && request.timeframes ? { timeframes: request.timeframes } : {}, score: report.score, tone: report.tone, headline: report.headline, ran: report.ran, positive: report.profitable, curve: chosen?.curve ?? [] }
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
  if (error.code === "batch_not_allowed")
    return t(
      "Tu plan no permite ejecutar varias simulaciones a la vez. Crea una cuenta gratis o mejora tu plan.",
      "Your plan doesn't allow running several simulations at once. Create a free account or upgrade your plan."
    )
  if (error.code === "batch_too_many")
    return t(error.message, "Your plan allows fewer simulations per run. Reduce the number and try again.")
  if (error.code === "mc_not_allowed")
    return t(
      "Tu plan no incluye Monte Carlo sobre caminos sintéticos. Crea una cuenta gratis o mejora tu plan.",
      "Your plan doesn't include Monte Carlo on synthetic paths. Create a free account or upgrade your plan."
    )
  if (error.code === "mc_too_many")
    return t(error.message, "Your plan allows fewer paths per run. Reduce the number and try again.")
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
