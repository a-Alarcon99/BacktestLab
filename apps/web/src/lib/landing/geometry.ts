// Pure helpers that turn the landing snapshot into SVG geometry and running figures.
// No imports on purpose: the tests load this file directly with Node.

export type Point = { x: number; y: number }

/** Maps [d0, d1] onto [r0, r1]; a flat domain maps to the middle of the range. */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0
  return (v: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))
}

export function extent(values: number[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo <= hi ? [lo, hi] : [0, 1]
}

/** Widens [lo, hi] by `pct` of its span on each side. */
export function pad([lo, hi]: [number, number], pct: number): [number, number] {
  const d = (hi - lo || Math.abs(hi) || 1) * pct
  return [lo - d, hi + d]
}

/** About `count` round values (1, 2, 2.5 or 5 × 10ⁿ apart) inside [lo, hi], for axis labels. */
export function niceTicks(lo: number, hi: number, count: number) {
  const raw = (hi - lo) / count
  if (!(raw > 0)) return [lo]
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v / step) * step)
  return ticks
}

const r = (v: number) => Math.round(v * 10) / 10

/** "M x y L x y …" through the points. */
export function linePath(points: Point[]) {
  return points.map((p, i) => `${i ? "L" : "M"}${r(p.x)} ${r(p.y)}`).join("")
}

/** Closed area between two lines sampled at the same x positions. */
export function bandPath(top: Point[], bottom: Point[]) {
  if (!top.length) return ""
  const back = [...bottom].reverse()
  return `${linePath(top)}${back.map((p) => `L${r(p.x)} ${r(p.y)}`).join("")}Z`
}

/** Area under a line down to `baseY`. */
export function areaPath(points: Point[], baseY: number) {
  if (!points.length) return ""
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)}L${r(last.x)} ${r(baseY)}L${r(first.x)} ${r(baseY)}Z`
}

/** Centre x of slot `i` of `n` slots spread over [x0, x1]. */
export function slotX(i: number, n: number, x0: number, x1: number) {
  return x0 + ((i + 0.5) * (x1 - x0)) / n
}

export type CandleShape = {
  x: number
  bodyY: number
  bodyH: number
  wickTop: number
  wickBottom: number
  up: boolean
}

/** Candle bodies and wicks; `y` maps a price to the SVG y. Bodies are at least 1 unit tall. */
export function candleShapes(
  candles: [number, number, number, number][],
  x0: number,
  x1: number,
  y: (price: number) => number
): CandleShape[] {
  return candles.map(([open, high, low, close], i) => {
    const top = y(Math.max(open, close))
    const bottom = y(Math.min(open, close))
    return {
      x: slotX(i, candles.length, x0, x1),
      bodyY: top,
      bodyH: Math.max(bottom - top, 1),
      wickTop: y(high),
      wickBottom: y(low),
      up: close >= open,
    }
  })
}

/** Worst peak-to-trough fall, in %, of `values` up to and including index `upTo`. */
export function maxDrawdownPct(values: number[], upTo = values.length - 1, start?: number) {
  let peak = start ?? values[0]
  let worst = 0
  for (let i = 0; i <= upTo && i < values.length; i++) {
    peak = Math.max(peak, values[i])
    if (peak > 0) worst = Math.max(worst, ((peak - values[i]) / peak) * 100)
  }
  return worst
}

export type RunningFigures = {
  /** Display index of the candle that closes the trade. */
  at: number
  returnPct: number
  winRatePct: number
  maxDrawdownPct: number
  trades: number
}

/** Account figures right after each closed trade, from the per-candle equity. */
export function runningFigures(
  trades: { exit: number; pnlPct: number }[],
  equity: number[],
  capital: number
): RunningFigures[] {
  let wins = 0
  return trades.map((t, k) => {
    wins += t.pnlPct > 0 ? 1 : 0
    return {
      at: t.exit,
      returnPct: (equity[t.exit] / capital - 1) * 100,
      winRatePct: (wins / (k + 1)) * 100,
      maxDrawdownPct: maxDrawdownPct(equity, t.exit, capital),
      trades: k + 1,
    }
  })
}

/** Counts of `values` per bin; `edges` are the inner limits (n edges → n + 1 bins). */
export function histogram(values: number[], edges: number[]) {
  const counts = new Array(edges.length + 1).fill(0) as number[]
  for (const v of values) {
    let bin = 0
    while (bin < edges.length && v >= edges[bin]) bin++
    counts[bin]++
  }
  return counts
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

/** Progress of `t` through [start, start + duration], clamped to [0, 1]. */
export const phase = (t: number, start: number, duration: number) => clamp((t - start) / duration)

export const easeOutCubic = (u: number) => 1 - (1 - u) ** 3
export const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2)
/** Overshoots slightly before settling: for things that "land". */
export const easeOutBack = (u: number) => {
  const c = 1.70158
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2
}

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u
export const lerpPoint = (a: Point, b: Point, u: number): Point => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) })

/** Point at `u` of a cubic Bézier. */
export function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, u: number): Point {
  const v = 1 - u
  const a = v ** 3
  const b = 3 * v * v * u
  const c = 3 * v * u * u
  const d = u ** 3
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

/** Control points of a wire between two ports, leaving/entering horizontally or vertically. */
export function wireControls(from: Point, to: Point, direction: "h" | "v"): [Point, Point, Point, Point] {
  if (direction === "h") {
    const k = Math.max(Math.abs(to.x - from.x) * 0.5, 30)
    return [from, { x: from.x + k, y: from.y }, { x: to.x - k, y: to.y }, to]
  }
  const k = Math.max(Math.abs(to.y - from.y) * 0.5, 24)
  return [from, { x: from.x, y: from.y + k }, { x: to.x, y: to.y - k }, to]
}

export function wirePath(from: Point, to: Point, direction: "h" | "v") {
  const [p0, p1, p2, p3] = wireControls(from, to, direction)
  return `M${r(p0.x)} ${r(p0.y)}C${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)} ${r(p3.x)} ${r(p3.y)}`
}

/** Approximate length of a cubic Bézier (for stroke-dasharray). */
export function cubicLength(p0: Point, p1: Point, p2: Point, p3: Point, steps = 24) {
  let length = 0
  let prev = p0
  for (let i = 1; i <= steps; i++) {
    const p = cubicPoint(p0, p1, p2, p3, i / steps)
    length += Math.hypot(p.x - prev.x, p.y - prev.y)
    prev = p
  }
  return length
}

/** Point at `u` of an arc from `a` to `b` that bulges `lift` units up (a quadratic Bézier). */
export function arcPoint(a: Point, b: Point, lift: number, u: number): Point {
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift }
  const v = 1 - u
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y }
}
