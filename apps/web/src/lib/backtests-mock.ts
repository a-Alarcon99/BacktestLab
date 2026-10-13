import type { Timeframe } from "@/lib/candles"

// Mock data for the backtest history UI. Replace with the real API once it exists.

export type BacktestSummary = {
  id: string
  symbol: string
  strategy: string
  timeframe: Timeframe
  /** Inclusive range, YYYY-MM-DD. */
  from: string
  to: string
  /** ISO timestamp of the run. */
  executedAt: string
  /** Percentages: 12.5 = +12.50%. */
  returnPct: number
  maxDrawdownPct: number
  sharpe: number
  winRatePct: number
  trades: number
  /** Normalized equity curve (starts at 100), for the list sparkline. */
  equity: number[]
}

/** Deterministic wavy curve from 100 to `100 + returnPct`. */
function curve(returnPct: number, seed: number) {
  const points = 24
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1)
    const noise = Math.sin(i * 1.7 + seed) * 3 * Math.sin(Math.PI * t)
    return 100 + returnPct * t + noise
  })
}

const SMA = "Cruce de medias (SMA 20/50)"
const RSI = "RSI reversión a la media"
const DONCHIAN = "Ruptura de rango (Donchian)"

const rows: Omit<BacktestSummary, "equity">[] = [
  { id: "bt-0010", symbol: "BTC", strategy: SMA, timeframe: "1d", from: "2023-01-01", to: "2025-12-31", executedAt: "2026-10-12T18:42:00Z", returnPct: 84.32, maxDrawdownPct: -21.4, sharpe: 1.42, winRatePct: 46.2, trades: 39 },
  { id: "bt-0009", symbol: "ETH", strategy: RSI, timeframe: "4h", from: "2024-01-01", to: "2025-12-31", executedAt: "2026-10-12T09:15:00Z", returnPct: 31.07, maxDrawdownPct: -14.8, sharpe: 1.08, winRatePct: 58.9, trades: 112 },
  { id: "bt-0008", symbol: "SOL", strategy: DONCHIAN, timeframe: "1d", from: "2023-06-01", to: "2025-12-31", executedAt: "2026-10-11T20:03:00Z", returnPct: 212.55, maxDrawdownPct: -38.2, sharpe: 1.77, winRatePct: 41.3, trades: 27 },
  { id: "bt-0007", symbol: "BNB", strategy: SMA, timeframe: "1w", from: "2021-01-01", to: "2025-12-31", executedAt: "2026-10-10T11:27:00Z", returnPct: -6.18, maxDrawdownPct: -33.9, sharpe: -0.12, winRatePct: 37.5, trades: 16 },
  { id: "bt-0006", symbol: "XRP", strategy: RSI, timeframe: "1h", from: "2025-06-01", to: "2025-12-31", executedAt: "2026-10-09T16:50:00Z", returnPct: 12.4, maxDrawdownPct: -9.6, sharpe: 0.94, winRatePct: 61.0, trades: 248 },
  { id: "bt-0005", symbol: "DOGE", strategy: DONCHIAN, timeframe: "4h", from: "2024-03-01", to: "2025-09-30", executedAt: "2026-10-08T08:11:00Z", returnPct: -18.76, maxDrawdownPct: -41.3, sharpe: -0.55, winRatePct: 33.8, trades: 71 },
  { id: "bt-0004", symbol: "ADA", strategy: SMA, timeframe: "1d", from: "2022-01-01", to: "2025-12-31", executedAt: "2026-10-06T19:36:00Z", returnPct: 5.92, maxDrawdownPct: -27.5, sharpe: 0.31, winRatePct: 44.4, trades: 45 },
  { id: "bt-0003", symbol: "AVAX", strategy: RSI, timeframe: "1d", from: "2023-01-01", to: "2025-12-31", executedAt: "2026-10-04T13:02:00Z", returnPct: 47.81, maxDrawdownPct: -19.2, sharpe: 1.21, winRatePct: 63.6, trades: 33 },
  { id: "bt-0002", symbol: "LINK", strategy: DONCHIAN, timeframe: "1w", from: "2020-01-01", to: "2025-12-31", executedAt: "2026-10-02T10:20:00Z", returnPct: 126.4, maxDrawdownPct: -35.7, sharpe: 1.36, winRatePct: 52.0, trades: 25 },
  { id: "bt-0001", symbol: "ARB", strategy: SMA, timeframe: "4h", from: "2024-01-01", to: "2025-12-31", executedAt: "2026-09-30T17:45:00Z", returnPct: -2.35, maxDrawdownPct: -24.1, sharpe: 0.02, winRatePct: 40.7, trades: 94 },
]

export const recentBacktests: BacktestSummary[] = rows.map((row, i) => ({
  ...row,
  equity: curve(row.returnPct, i + 1),
}))
