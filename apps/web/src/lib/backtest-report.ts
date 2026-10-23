import type { BacktestRecord, BacktestRecordV2, BacktestRequest, BacktestResult, BacktestTrade, RoundTrip } from "./backtests.ts"
import { niceTicks } from "./chart-geometry.ts"

// Pure logic of the backtest replay and report: running figures while it plays, the verdict, the
// reliability notes, the comparison with a previous run and the CSV export. Only type imports and
// relative `.ts` imports, so `node --test` can load it. Texts live in the components: this module
// returns codes, tones and numbers.

export type Tone = "good" | "mixed" | "bad"

// --- Live figures ------------------------------------------------------------------------------

/** Per display candle lookups, computed once per result. */
export type LiveTrack = {
  /** Deepest drawdown up to and including each display candle (%). */
  maxDrawdown: number[]
  /** Closed trades and winners whose exit is at or before each display candle. */
  closed: number[]
  wins: number[]
  /** Index in `roundTrips` of the trade open at the end of each display candle, or -1. */
  openTrip: number[]
}

export function liveTrack(result: BacktestResult): LiveTrack {
  const n = result.candles.length
  const maxDrawdown = new Array<number>(n)
  let worst = 0
  for (let i = 0; i < n; i++) {
    worst = Math.max(worst, result.drawdown[i] ?? 0)
    maxDrawdown[i] = worst
  }
  const closedAt = new Array<number>(n).fill(0)
  const winsAt = new Array<number>(n).fill(0)
  const openTrip = new Array<number>(n).fill(-1)
  result.roundTrips.forEach((trip, k) => {
    if (trip.open) {
      for (let i = trip.entryIndex; i < n; i++) openTrip[i] = k
      return
    }
    closedAt[trip.exitIndex]++
    if (trip.pnl > 0) winsAt[trip.exitIndex]++
    // Held from its entry bucket until the bucket before its exit (the exit bucket may already
    // hold the next entry).
    for (let i = trip.entryIndex; i < trip.exitIndex; i++) openTrip[i] = k
  })
  let closed = 0
  let wins = 0
  for (let i = 0; i < n; i++) {
    closed += closedAt[i]
    wins += winsAt[i]
    closedAt[i] = closed
    winsAt[i] = wins
  }
  return { maxDrawdown, closed: closedAt, wins: winsAt, openTrip }
}

export type LiveFigures = {
  equity: number
  returnPct: number
  benchmarkReturnPct: number
  /** Strategy minus buy and hold, in percentage points. */
  vsBenchmark: number
  maxDrawdownPct: number
  drawdownPct: number
  closed: number
  wins: number
  orders: number
  /** Buy and sell orders so far (one trade can hold several of each). */
  buys: number
  sells: number
  /** Trade open at this candle and the price change since its average entry (fees excluded). */
  openTrip: RoundTrip | null
  openChangePct: number | null
}

/** Account figures at the end of display candle `i`. */
export function liveFigures(result: BacktestResult, track: LiveTrack, capital: number, i: number): LiveFigures {
  const k = Math.max(0, Math.min(result.candles.length - 1, i))
  const equity = result.equity[k]
  const returnPct = (equity / capital - 1) * 100
  const benchmarkReturnPct = (result.benchmark[k] / capital - 1) * 100
  const trip = track.openTrip[k] >= 0 ? result.roundTrips[track.openTrip[k]] : null
  return {
    equity,
    returnPct,
    benchmarkReturnPct,
    vsBenchmark: returnPct - benchmarkReturnPct,
    maxDrawdownPct: track.maxDrawdown[k],
    drawdownPct: result.drawdown[k],
    closed: track.closed[k],
    wins: track.wins[k],
    orders: result.buys[k] + result.sells[k],
    buys: result.buys[k],
    sells: result.sells[k],
    openTrip: trip,
    openChangePct: trip ? (result.candles[k].close / trip.entryPrice - 1) * 100 : null,
  }
}

// --- Verdict -----------------------------------------------------------------------------------

/** A gap with buy and hold this small (percentage points) counts as "about the same". */
export const SAME_AS_BENCHMARK_PTS = 1
export const DRAWDOWN_LOW_PCT = 10
export const DRAWDOWN_HIGH_PCT = 25
export const DRAWDOWN_SEVERE_PCT = 40
export const PROFIT_FACTOR_GOOD = 1.5

export type VerdictHeadline = "no-trades" | "beats" | "beats-risky" | "matches" | "lags" | "loses-less" | "loses"

export type VerdictItem =
  | { id: "result"; tone: Tone; returnPct: number; netProfit: number }
  | { id: "benchmark"; tone: Tone; excessPts: number; benchmarkReturnPct: number }
  | { id: "risk"; tone: Tone; drawdownPct: number; benchmarkDrawdownPct: number }
  | { id: "consistency"; tone: Tone; profitFactor: number | null; winRatePct: number; payoffRatio: number | null; closed: number }

export type Verdict = { headline: VerdictHeadline; tone: Tone; items: VerdictItem[] }

export function benchmarkTone(excessPts: number): Tone {
  if (excessPts > SAME_AS_BENCHMARK_PTS) return "good"
  if (excessPts < -SAME_AS_BENCHMARK_PTS) return "bad"
  return "mixed"
}

/** Drawdown judged on its own and next to buy and hold's (crypto falls a lot by itself). */
export function riskTone(drawdownPct: number, benchmarkDrawdownPct: number): Tone {
  if (drawdownPct <= DRAWDOWN_LOW_PCT) return "good"
  if (drawdownPct <= DRAWDOWN_HIGH_PCT && drawdownPct <= benchmarkDrawdownPct / 2) return "good"
  if (drawdownPct > DRAWDOWN_SEVERE_PCT) return "bad"
  if (drawdownPct > DRAWDOWN_HIGH_PCT && drawdownPct > benchmarkDrawdownPct * 0.75) return "bad"
  return "mixed"
}

export function consistencyTone(profitFactor: number | null, wins: number, closed: number): Tone {
  if (closed === 0) return "mixed"
  if (profitFactor === null) return wins > 0 ? "good" : "bad"
  if (profitFactor >= PROFIT_FACTOR_GOOD) return "good"
  if (profitFactor >= 1) return "mixed"
  return "bad"
}

export function verdict(result: BacktestResult): Verdict {
  const m = result.metrics
  const resultTone: Tone = m.returnPct > 0.5 ? "good" : m.returnPct < -0.5 ? "bad" : "mixed"
  const items: VerdictItem[] = [
    { id: "result", tone: resultTone, returnPct: m.returnPct, netProfit: m.netProfit },
    {
      id: "benchmark",
      tone: benchmarkTone(m.excessReturnPct),
      excessPts: m.excessReturnPct,
      benchmarkReturnPct: m.benchmarkReturnPct,
    },
    {
      id: "risk",
      tone: riskTone(m.maxDrawdownPct, m.benchmarkMaxDrawdownPct),
      drawdownPct: m.maxDrawdownPct,
      benchmarkDrawdownPct: m.benchmarkMaxDrawdownPct,
    },
    {
      id: "consistency",
      tone: consistencyTone(m.profitFactor, m.wins, m.roundTrips),
      profitFactor: m.profitFactor,
      winRatePct: m.winRatePct,
      payoffRatio: m.payoffRatio,
      closed: m.roundTrips,
    },
  ]
  if (result.stats.trades === 0) return { headline: "no-trades", tone: "mixed", items: items.slice(1, 2) }

  const beats = m.excessReturnPct > SAME_AS_BENCHMARK_PTS
  const lags = m.excessReturnPct < -SAME_AS_BENCHMARK_PTS
  const riskBad = items[2].tone === "bad"
  let headline: VerdictHeadline
  let tone: Tone
  if (m.returnPct > 0) {
    if (beats) [headline, tone] = riskBad ? ["beats-risky", "mixed"] : ["beats", "good"]
    else if (lags) [headline, tone] = ["lags", "mixed"]
    else [headline, tone] = ["matches", "mixed"]
  } else if (beats) [headline, tone] = ["loses-less", "mixed"]
  else [headline, tone] = ["loses", "bad"]
  return { headline, tone, items }
}

// --- Reliability notes ---------------------------------------------------------------------------

export const FEW_TRADES = 10
export const SHORT_PERIOD_DAYS = 30
export const ONE_TRADE_SHARE_PCT = 50
export const SIDEWAYS_PCT = 5

export type Warning =
  | { id: "no-trades" }
  | { id: "few-trades"; closed: number }
  | { id: "open-position"; pnl: number; pnlPct: number }
  | { id: "short-period"; days: number }
  | { id: "one-trade"; sharePct: number }
  | { id: "sideways"; benchmarkReturnPct: number }

/** Reasons to take the result with care, most important first. */
export function reliabilityWarnings(result: BacktestResult): Warning[] {
  const m = result.metrics
  const out: Warning[] = []
  if (result.stats.trades === 0) out.push({ id: "no-trades" })
  else if (m.roundTrips < FEW_TRADES) out.push({ id: "few-trades", closed: m.roundTrips })
  const open = result.roundTrips.find((t) => t.open)
  if (open) out.push({ id: "open-position", pnl: open.pnl, pnlPct: open.pnlPct })
  if (m.days < SHORT_PERIOD_DAYS) out.push({ id: "short-period", days: m.days })
  if (m.bestTradeSharePct !== null && m.roundTrips >= 2 && m.bestTradeSharePct > ONE_TRADE_SHARE_PCT)
    out.push({ id: "one-trade", sharePct: m.bestTradeSharePct })
  if (Math.abs(m.benchmarkReturnPct) < SIDEWAYS_PCT && m.days >= SHORT_PERIOD_DAYS)
    out.push({ id: "sideways", benchmarkReturnPct: m.benchmarkReturnPct })
  return out
}

// --- Previous run ------------------------------------------------------------------------------

export type PreviousRun = {
  record: BacktestRecordV2
  returnDelta: number
  drawdownDelta: number
  winRateDelta: number
  /** Same asset, strategy, timeframe and dates: only the strategy's rules may differ. */
  samePeriod: boolean
  /** The strategy's rules, capital and fee are the same as now. */
  sameRules: boolean
}

const strategyKey = (s: BacktestRequest["strategy"]) => JSON.stringify([s.rules, s.initialCapital, s.feePct])

/**
 * The run of the same strategy on the same asset saved before `currentId` (newest first list).
 * Records of the previous engine (version 1) are never compared.
 */
export function previousRun(
  records: BacktestRecord[],
  request: BacktestRequest,
  current: { returnPct: number; maxDrawdownPct: number; winRatePct: number },
  currentId: string | undefined
): PreviousRun | null {
  const at = currentId ? records.findIndex((r) => r.id === currentId) : -1
  const candidates = at >= 0 ? records.slice(at + 1) : records
  const record = candidates.find(
    (r): r is BacktestRecordV2 =>
      r.schemaVersion === 2 && r.symbol === request.symbol && r.strategy.id === request.strategy.id
  )
  if (!record) return null
  return {
    record,
    returnDelta: current.returnPct - record.stats.returnPct,
    drawdownDelta: current.maxDrawdownPct - record.stats.maxDrawdownPct,
    winRateDelta: current.winRatePct - record.stats.winRatePct,
    samePeriod: record.timeframe === request.timeframe && record.from === request.from && record.to === request.to,
    sameRules: strategyKey(record.strategy) === strategyKey(request.strategy),
  }
}

// --- Charts ------------------------------------------------------------------------------------

/** Histogram of trade results (%): round bins with 0 always on an edge. */
export function resultBins(pcts: number[], target = 10) {
  if (!pcts.length) return { edges: [] as number[], counts: [] as number[] }
  const lo = Math.min(0, ...pcts)
  const hi = Math.max(0, ...pcts)
  const ticks = niceTicks(lo, hi, Math.max(2, Math.min(target, pcts.length + 1)))
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : Math.max(Math.abs(hi - lo), 1)
  const start = Math.floor(lo / step) * step
  const end = Math.max(Math.ceil(hi / step) * step, start + step)
  const edges: number[] = []
  for (let v = start; v <= end + step / 2; v += step) edges.push(Math.round(v / step) * step)
  if (edges[edges.length - 1] <= hi) edges.push(edges[edges.length - 1] + step)
  const counts = new Array<number>(edges.length - 1).fill(0)
  for (const v of pcts) {
    let bin = 0
    while (bin < counts.length - 1 && v >= edges[bin + 1]) bin++
    counts[bin]++
  }
  return { edges, counts }
}

/** Seconds as whole days/hours/minutes (the two largest units are enough to show). */
export function splitDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds / 60))
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 }
}

// --- One trade's orders --------------------------------------------------------------------------

/** Every buy and sell of the trade `k` (index in `roundTrips`), in the order they filled. */
export function tripOrders(result: BacktestResult, k: number): BacktestTrade[] {
  return result.trades.filter((order) => order.roundTrip === k)
}

// --- CSV ---------------------------------------------------------------------------------------

function csvCell(value: string, sep: string) {
  return value.includes(sep) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

const isoMinute = (iso: string) => iso.slice(0, 16).replace("T", " ")

/**
 * The trade list as CSV for spreadsheets: `;` and a decimal comma in Spanish (what Excel expects
 * there), `,` and a decimal point in English. Starts with a BOM so accents survive Excel.
 */
export function tradesCsv(
  trips: RoundTrip[],
  locale: "es" | "en",
  headers: string[],
  ruleLabel: (id: string | null) => string,
  status: (open: boolean) => string
) {
  const sep = locale === "es" ? ";" : ","
  const num = (v: number, digits: number) => {
    const s = v.toFixed(digits)
    return locale === "es" ? s.replace(".", ",") : s
  }
  const rows = trips.map((t, k) =>
    [
      String(k + 1),
      isoMinute(t.entryTime),
      t.exitTime ? isoMinute(t.exitTime) : "",
      num(t.entryPrice, 8).replace(/0+$/, "").replace(/[.,]$/, ""),
      num(t.exitPrice, 8).replace(/0+$/, "").replace(/[.,]$/, ""),
      num(t.invested, 2),
      num(t.pnl, 2),
      num(t.pnlPct, 2),
      String(t.bars),
      num(t.durationSeconds / 3600, 2),
      ruleLabel(t.exitRuleId),
      status(t.open),
    ]
      .map((cell) => csvCell(cell, sep))
      .join(sep)
  )
  const bom = "\uFEFF"
  const eol = "\r\n"
  return `${bom}${[headers.map((cell) => csvCell(cell, sep)).join(sep), ...rows].join(eol)}${eol}`
}
