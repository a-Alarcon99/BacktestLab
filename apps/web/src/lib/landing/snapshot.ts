import data from "./snapshot.json"

// Real backtest results behind the landing animations, written by the API's
// `python -m app.landing_snapshot` (re-run it to refresh them). Indices are positions in the
// arrays of their own block; percentages are plain numbers (12.5 = +12.5 %).

export type SnapshotTrade = {
  entry: number
  exit: number
  entryPrice: number
  exitPrice: number
  pnlPct: number
  /** Real candles held (the indices of `metrics` are display points). */
  bars: number
  exitRule: string
}

export type ReplayTrade = SnapshotTrade & { entryRsi: number }

export type MetricsTrade = SnapshotTrade & {
  /** Return of the whole account once this trade is closed. */
  returnAfterPct: number
  /** Worst drawdown so far once this trade is closed. */
  maxDrawdownAfterPct: number
}

export type PresetResult = {
  timeframe: string
  from: string
  to: string
  returnPct: number
  winRatePct: number
  maxDrawdownPct: number
  sharpe: number
  roundTrips: number
  openPosition: boolean
  buyHoldPct: number
  /** Equity normalized to 100 at the start. */
  curve: number[]
}

export type Snapshot = {
  symbol: string
  feePct: number
  initialCapital: number
  generatedAt: string
  replay: {
    timeframe: string
    /** Open time of the first candle (ISO, UTC). */
    start: string
    from: string
    to: string
    /** [open, high, low, close] */
    candles: [number, number, number, number][]
    lower: number[]
    upper: number[]
    equity: number[]
    trades: ReplayTrade[]
    stats: { returnPct: number; winRatePct: number; maxDrawdownPct: number; roundTrips: number }
  }
  builder: {
    timeframe: string
    from: string
    to: string
    closes: number[]
    and: number[]
    or: number[]
    andCount: number
    orCount: number
  }
  metrics: {
    timeframe: string
    from: string
    to: string
    closes: number[]
    equity: number[]
    trades: MetricsTrade[]
    stats: {
      returnPct: number
      winRatePct: number
      maxDrawdownPct: number
      sharpe: number
      roundTrips: number
      openPosition: boolean
    }
  }
  presets: Record<string, PresetResult>
}

// JSON arrays are typed as `number[][]`; the shape is checked by `tests/landing-geometry.test.ts`.
export const snapshot = data as unknown as Snapshot
