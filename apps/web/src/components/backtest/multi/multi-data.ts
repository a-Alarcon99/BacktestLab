import { indexAt, returnPctOf, seriesOf, valueAt, type Series } from "@/lib/batch-report"
import type { BacktestResult, AssetsBatchResult } from "@/lib/backtests"

// Everything the multi-asset animation draws is a pure function of `pos`, the playback position in
// timeline steps (0..STEPS). The timeline is the requested date range, so assets whose history
// begins later simply have nothing to show until their first candle.

/** Timeline resolution: 360 steps play for 12 s at 1x (see `replayDuration`). */
export const STEPS = 360

/** Points kept per curve in a tile (the engine already sends at most 1500). */
const TILE_POINTS = 200

const DAY_MS = 86_400_000

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export type Timeline = { fromMs: number; toMs: number }

/** The requested range as ms: `to` is an inclusive day, so the timeline ends where the next begins. */
export const timelineOf = (from: string, to: string): Timeline => ({ fromMs: Date.parse(from), toMs: Date.parse(to) + DAY_MS })

export const timeAt = ({ fromMs, toMs }: Timeline, pos: number) => fromMs + (Math.min(pos, STEPS) / STEPS) * (toMs - fromMs)

export type TileData = {
  symbol: string
  result: BacktestResult | null
  /** Whole curves, for exact lookups by time. */
  equity: Series | null
  hold: Series | null
  /** Sampled curves for drawing: x as a fraction of the timeline, y as the value. */
  fx: number[]
  eq: number[]
  bm: number[]
  /** Value range of the drawn curves (the capital included), for the tile's own y axis. */
  lo: number
  hi: number
  /** Where the asset's first candle falls on the timeline (0 = on time). */
  startFrac: number
  startsAt: string | null
  /** Return % at the end of the range (strategy and buy and hold). */
  finalReturn: number | null
  finalHold: number | null
  /** Orders as a fraction of the timeline, ascending. */
  orders: { fx: number; side: "buy" | "sell" }[]
  /** Stretches of the timeline (as fractions) with a position open. */
  held: [number, number][]
  /** Closed trades by the fraction of the timeline where they closed, with their result (%). */
  exits: { fx: number; pnlPct: number }[]
}

function sample(length: number, max: number): number[] {
  if (length <= max) return Array.from({ length }, (_, i) => i)
  const picked: number[] = []
  const step = (length - 1) / (max - 1)
  for (let k = 0; k < max; k++) picked.push(Math.round(k * step))
  return picked
}

export function buildTiles(result: AssetsBatchResult, timeline: Timeline, capital: number): TileData[] {
  const span = timeline.toMs - timeline.fromMs
  return result.items.map((item) => {
    const equity = seriesOf(item)
    const r = item.result
    if (!equity || !r) {
      return { symbol: item.symbol, result: null, equity: null, hold: null, fx: [], eq: [], bm: [], lo: 0, hi: 1, startFrac: 0, startsAt: null, finalReturn: null, finalHold: null, orders: [], held: [], exits: [] }
    }
    const hold: Series = { t: equity.t, equity: r.benchmark }
    const picked = sample(equity.t.length, TILE_POINTS)
    const fx = picked.map((i) => (equity.t[i] - timeline.fromMs) / span)
    const eq = picked.map((i) => equity.equity[i])
    const bm = picked.map((i) => r.benchmark[i])
    const lo = Math.min(capital, ...eq, ...bm)
    const hi = Math.max(capital, ...eq, ...bm)
    return {
      symbol: item.symbol,
      result: r,
      equity,
      hold,
      fx,
      eq,
      bm,
      lo,
      hi,
      startFrac: Math.max(0, (equity.t[0] - timeline.fromMs) / span),
      startsAt: item.startsAt,
      finalReturn: r.stats.returnPct,
      finalHold: r.stats.benchmarkReturnPct,
      orders: r.trades.map((trade) => ({ fx: clamp01((Date.parse(trade.time) - timeline.fromMs) / span), side: trade.side })),
      held: r.roundTrips.map((trip): [number, number] => [
        clamp01((Date.parse(trip.entryTime) - timeline.fromMs) / span),
        trip.exitTime ? clamp01((Date.parse(trip.exitTime) - timeline.fromMs) / span) : 1,
      ]),
      exits: r.roundTrips.flatMap((trip) => (trip.open || !trip.exitTime ? [] : [{ fx: clamp01((Date.parse(trip.exitTime) - timeline.fromMs) / span), pnlPct: trip.pnlPct }])),
    }
  })
}

/** Return % of the strategy and of buy and hold at `pos`, `null` before the asset's first candle. */
export function returnsAt(tile: TileData, timeline: Timeline, capital: number, pos: number) {
  if (!tile.equity || !tile.hold) return { strategy: null, hold: null }
  const t = timeAt(timeline, pos)
  const e = valueAt(tile.equity, t)
  const h = valueAt(tile.hold, t)
  return { strategy: e === null ? null : returnPctOf(e, capital), hold: h === null ? null : returnPctOf(h, capital) }
}

/** Number of leading points of a sampled curve at or before the fraction `u` of the timeline. */
export function visibleCount(fx: number[], u: number): number {
  let lo = 0
  let hi = fx.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (fx[mid] <= u) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Range of the ranking bars over the whole run (static, so the bars never rescale while playing). */
export function returnDomain(tiles: TileData[], capital: number): [number, number] {
  let lo = 0
  let hi = 0
  for (const tile of tiles) {
    for (const v of [...tile.eq, ...tile.bm]) {
      const r = returnPctOf(v, capital)
      if (r < lo) lo = r
      if (r > hi) hi = r
    }
  }
  return hi - lo < 1 ? [lo, lo + 1] : [lo, hi]
}

/** Orders placed by the fraction `u` (0-1) of the timeline. */
export function ordersUpTo(tile: TileData, u: number): number {
  let n = 0
  for (const order of tile.orders) if (order.fx <= u) n++
  return n
}

/** Whether the strategy holds a position at the fraction `u` of the timeline. */
export const inMarketAt = (tile: TileData, u: number) => tile.held.some(([from, to]) => u >= from && u < to)

/** Fall below the previous peak (%, positive) at `pos`, or `null` before the asset's first candle. */
export function drawdownAt(tile: TileData, timeline: Timeline, pos: number): number | null {
  if (!tile.equity || !tile.result) return null
  const i = indexAt(tile.equity, timeAt(timeline, pos))
  return i === null ? null : (tile.result.drawdown[i] ?? 0)
}
