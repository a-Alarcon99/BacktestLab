import { ApiError, apiFetch } from "@/lib/api"
import type { Timeframe } from "@/lib/candles"
import type { Strategy } from "@/lib/strategy"

// Client-safe: backtest request/result types (mirror `app/schemas/backtest.py`) and the saved
// summary of a run.

/** Runs kept in the history. */
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

export function runBacktest(request: BacktestRequest, signal?: AbortSignal): Promise<BacktestResult> {
  return apiFetch<BacktestResult>("/backtests/run", { method: "POST", body: JSON.stringify(request), signal })
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
export function describeBacktestError(error: unknown) {
  if (!(error instanceof ApiError)) return "No se pudo conectar con el servidor de backtesting."
  if (error.status === 404) return "El activo no existe o no está disponible."
  if (error.status === 422) {
    try {
      const { detail } = JSON.parse(error.body) as { detail: unknown }
      if (typeof detail === "string") {
        return detail === "Not enough candles in the range" || detail === "The range must be at least 1 day"
          ? "No hay suficientes velas en el rango elegido. Amplía las fechas o usa una temporalidad menor."
          : detail
      }
      if (Array.isArray(detail) && detail.every((d) => typeof d === "string")) return detail.join(" ")
    } catch {}
    return "La estrategia o los parámetros del backtest no son válidos."
  }
  return "El servidor de backtesting ha fallado. Inténtalo de nuevo."
}
