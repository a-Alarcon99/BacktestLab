"use client"

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "cn"
import type { BacktestResult, RoundTrip } from "@/lib/backtests"
import { clamp, easeOutBack, easeOutCubic, linePath, niceTicks, type Point } from "@/lib/chart-geometry"
import { useWidth } from "@/lib/motion"
import type { Rule } from "@/lib/strategy"
import { useReplayText } from "./format"
import { TradeTooltip } from "./trade-tooltip"

export type View = { start: number; end: number }

const PAD = { l: 8, r: 68, t: 16, b: 22 }
/** Slot width (px) under which candles turn into a close line with a high/low band. */
const DENSE_SLOT = 2
const MARKER_HIT = 14
/** The live price scale spans at least this many typical candle ranges. */
const MIN_SCALE_CANDLES = 14
/** Fewest candles a zoom can show. */
export const MIN_VIEW = 16

/** Candle slot that fits `width` at the replay's density (the live window). */
export const liveWindow = (width: number, steps: number) =>
  Math.max(8, Math.min(steps, Math.floor((width - PAD.l - PAD.r) / 10)))

type Hover = { kind: "trade"; n: number; x: number; y: number } | { kind: "candle"; i: number; x: number }

/**
 * Candlestick chart of a backtest with its trades, drawn in SVG.
 *
 * `revealed` is the playback position in candles: candles before `floor(revealed)` are complete,
 * the next one is forming (its body grows towards its close). Event animations (marker pop,
 * ripple, result pill, entry-exit arc) are a function of how far playback has moved past them,
 * so they freeze when paused and are right after a seek. Without `onViewChange` it isn't
 * interactive; with it, drag pans, the wheel zooms and hovering shows orders and candles.
 */
export function PriceChart({
  result,
  rules,
  intraday,
  view,
  revealed,
  cps,
  live,
  height,
  highlight,
  onViewChange,
  className,
  label,
}: {
  result: BacktestResult
  rules: Rule[]
  intraday: boolean
  view: View
  revealed: number
  /** Candles per second at 1×: converts playback distance into animation seconds. */
  cps: number
  live: boolean
  height: number
  highlight?: number | null
  onViewChange?: (view: View) => void
  className?: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const { t, f } = useReplayText()
  const [hover, setHover] = useState<Hover | null>(null)
  const drag = useRef<{ x: number; view: View } | null>(null)
  const steps = result.candles.length
  // Typical candle size, from the first candles only (a scale floor, not a view of the future).
  const typicalRange = useMemo(() => {
    const ranges = result.candles
      .slice(0, 60)
      .map((c) => c.high - c.low)
      .sort((a, b) => a - b)
    return ranges.length ? ranges[Math.floor(ranges.length / 2)] : 0
  }, [result.candles])
  const W = Math.max(width, 1)
  const plotW = Math.max(W - PAD.l - PAD.r, 1)
  const plotH = height - PAD.t - PAD.b
  const span = Math.max(view.end - view.start, 1)
  const slot = plotW / span
  const x = (i: number) => PAD.l + (i - view.start + 0.5) * slot
  const full = Math.floor(revealed)
  const forming = revealed - full
  const shown = Math.min(steps, full + (forming > 0 ? 1 : 0))
  const i0 = Math.max(0, Math.floor(view.start))
  const i1 = Math.min(shown, Math.ceil(view.end))
  const current = Math.max(0, shown - 1)

  // Candle values with the forming one interpolated from its open towards its close.
  const candleAt = (i: number) => {
    const c = result.candles[i]
    if (i !== full || forming <= 0 || !live) return c
    const close = c.open + (c.close - c.open) * forming
    return {
      ...c,
      close,
      high: Math.max(c.open, close) + (c.high - Math.max(c.open, c.close)) * forming,
      low: Math.min(c.open, close) - (Math.min(c.open, c.close) - c.low) * forming,
    }
  }

  // Price scale. Candles near the left edge weigh less, so the scale changes smoothly while the
  // live window scrolls instead of jumping when an extreme leaves it.
  let lo = Infinity
  let hi = -Infinity
  const fadeSpan = live ? Math.max(4, span * 0.25) : 0
  const mid = i1 > i0 ? candleAt(i1 - 1).close : result.candles[0].close
  for (let i = i0; i < i1; i++) {
    const c = candleAt(i)
    const w = fadeSpan ? clamp((i - view.start) / fadeSpan) : 1
    lo = Math.min(lo, mid + (c.low - mid) * w)
    hi = Math.max(hi, mid + (c.high - mid) * w)
  }
  if (!(hi > lo)) {
    const c = result.candles[Math.min(i0, steps - 1)]
    lo = c.low
    hi = c.high > c.low ? c.high : c.low * 1.01 + 1e-9
  }
  // The first candles would fill the whole chart on their own: keep the scale at least as wide as
  // a window of typical candles, so they start small and the scale only grows as price moves.
  if (live) {
    const floor = Math.max(typicalRange * MIN_SCALE_CANDLES, mid * 0.004)
    if (hi - lo < floor) {
      const centre = (hi + lo) / 2
      lo = centre - floor / 2
      hi = centre + floor / 2
    }
  }
  const margin = (hi - lo) * 0.08
  lo -= margin
  hi += margin
  const y = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * plotH
  const ticks = niceTicks(lo, hi, Math.max(2, Math.round(plotH / 56)))

  const dense = slot < DENSE_SLOT
  const candleOpacity = clamp((slot - DENSE_SLOT * 0.6) / (DENSE_SLOT * 0.8))
  const age = (index: number) => (revealed - index - 1) / cps
  const tripsInView = result.roundTrips
    .map((trip, k) => ({ trip, k }))
    .filter(({ trip }) => trip.entryIndex < shown && trip.exitIndex >= view.start - 1 && trip.entryIndex <= view.end + 1)
  const ordersInView = result.trades
    .map((trade, n) => ({ trade, n }))
    .filter(({ trade }) => trade.index < shown && trade.index >= view.start - 1 && trade.index <= view.end + 1)
  const busy = ordersInView.length > 240

  // Close line + high/low band for dense views (also crossfades with the candles).
  const denseLayer = (() => {
    if (candleOpacity >= 1) return null
    const step = Math.max(1, Math.floor(1 / slot))
    const top: Point[] = []
    const bottom: Point[] = []
    const line: Point[] = []
    for (let i = i0; i < i1; i += step) {
      let h = -Infinity
      let l = Infinity
      for (let k = i; k < Math.min(i + step, i1); k++) {
        h = Math.max(h, result.candles[k].high)
        l = Math.min(l, result.candles[k].low)
      }
      const cx = x(i)
      top.push({ x: cx, y: y(h) })
      bottom.push({ x: cx, y: y(l) })
      line.push({ x: cx, y: y(result.candles[Math.min(i + step, i1) - 1].close) })
    }
    const back = [...bottom].reverse()
    return {
      band: top.length ? `${linePath(top)}${back.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("")}Z` : "",
      line: linePath(line),
    }
  })()

  const markerY = (side: "buy" | "sell", index: number) => {
    const c = candleAt(index)
    return side === "buy" ? Math.min(y(c.low) + 11, height - PAD.b - 4) : Math.max(y(c.high) - 11, PAD.t)
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onViewChange) return
    drag.current = { x: e.clientX, view }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onViewChange) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    if (drag.current) {
      const shift = (drag.current.x - e.clientX) / slot
      const v = drag.current.view
      const s = clamp(v.start + shift, 0, steps - (v.end - v.start))
      onViewChange({ start: s, end: s + (v.end - v.start) })
      setHover(null)
      return
    }
    let best: Hover | null = null
    let bestDist = MARKER_HIT
    for (const { trade, n } of ordersInView) {
      const mx = x(trade.index)
      const my = markerY(trade.side, trade.index)
      const d = Math.hypot(mx - px, my - py)
      if (d <= bestDist) {
        bestDist = d
        best = { kind: "trade", n, x: mx, y: my }
      }
    }
    if (!best && px >= PAD.l && px <= W - PAD.r) {
      const i = Math.round(view.start + (px - PAD.l) / slot - 0.5)
      if (i >= 0 && i < shown) best = { kind: "candle", i, x: x(i) }
    }
    setHover(best)
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onWheel = (e: WheelEvent, svg: SVGSVGElement) => {
    if (!onViewChange) return
    e.preventDefault()
    const rect = svg.getBoundingClientRect()
    const anchor = view.start + ((e.clientX - rect.left - PAD.l) / plotW) * span
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    if (horizontal) {
      const s = clamp(view.start + e.deltaX / slot, 0, steps - span)
      onViewChange({ start: s, end: s + span })
      return
    }
    const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18
    const next = clamp(span * factor, Math.min(MIN_VIEW, steps), steps)
    const s = clamp(anchor - ((anchor - view.start) / span) * next, 0, steps - next)
    onViewChange({ start: s, end: s + next })
  }

  // The wheel zooms (or pans sideways) instead of scrolling the dialog: needs a non-passive listener.
  const svgRef = useRef<SVGSVGElement>(null)
  const wheelRef = useRef(onWheel)
  useEffect(() => {
    wheelRef.current = onWheel
  })
  const interactive = Boolean(onViewChange)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !interactive) return
    const listener = (e: WheelEvent) => wheelRef.current(e, svg)
    svg.addEventListener("wheel", listener, { passive: false })
    return () => svg.removeEventListener("wheel", listener)
  }, [interactive, width])

  const id = useId()
  const scanId = `${id}-scan`
  const clipId = `${id}-clip`
  const hoveredTrade = hover?.kind === "trade" ? result.trades[hover.n] : undefined
  const hoveredCandle = hover?.kind === "candle" ? result.candles[hover.i] : undefined
  const dateFormat = intraday ? f.axisDateTime : f.axisDate
  const labelCount = Math.max(2, Math.min(6, Math.floor(plotW / 120)))
  const timeLabels = Array.from({ length: labelCount }, (_, k) =>
    Math.round(view.start + 0.5 + (k * (span - 1)) / (labelCount - 1))
  ).filter((i, k, all) => i >= 0 && i < shown && all.indexOf(i) === k)

  return (
    <div ref={ref} className={cn("relative select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg
          ref={svgRef}
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          role="img"
          aria-label={label}
          className={cn("block touch-pan-y", onViewChange && "cursor-grab active:cursor-grabbing")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            drag.current = null
            setHover(null)
          }}
          onDoubleClick={() => onViewChange?.({ start: 0, end: steps })}
        >
          <defs>
            <linearGradient id={scanId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0.18" />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={PAD.l} y={0} width={plotW} height={height - PAD.b} />
            </clipPath>
          </defs>

          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={W - PAD.r + 8} y={y(v) + 3.5} className="num fill-muted-foreground text-[10px]">
                {f.axisPrice(v)}
              </text>
            </g>
          ))}
          {timeLabels.map((i) => (
            <text
              key={i}
              x={clamp(x(i), PAD.l + 30, W - PAD.r - 30)}
              y={height - 6}
              textAnchor="middle"
              className="num fill-muted-foreground text-[10px]"
            >
              {dateFormat.format(new Date(result.candles[i].time))}
            </text>
          ))}

          <g clipPath={`url(#${clipId})`}>
            {/* Time in the market: one zone per trade, coloured by its result once it closes. */}
            {tripsInView.map(({ trip, k }) => {
              const closed = !trip.open && trip.exitIndex < shown
              const end = closed ? trip.exitIndex : current
              const x0 = x(trip.entryIndex) - slot / 2
              const x1 = x(end) + slot / 2
              const open = live && !closed
              const change = open ? candleAt(current).close / trip.entryPrice - 1 : trip.pnl
              const win = change > 0
              const lit = highlight === k
              return (
                <g key={k}>
                  <rect
                    x={x0}
                    y={PAD.t - 6}
                    width={Math.max(x1 - x0, 1)}
                    height={plotH + 6}
                    fill={win ? "var(--up)" : "var(--down)"}
                    fillOpacity={lit ? 0.2 : open ? 0.07 : 0.1}
                    stroke={lit ? (win ? "var(--up)" : "var(--down)") : "none"}
                    strokeWidth={1.5}
                    rx={2}
                  />
                  {slot > 1.5 && (
                    <line
                      x1={x0}
                      x2={x1}
                      y1={y(trip.entryPrice)}
                      y2={y(trip.entryPrice)}
                      stroke="var(--muted-foreground)"
                      strokeOpacity={0.55}
                      strokeDasharray="3 3"
                    />
                  )}
                </g>
              )
            })}

            {denseLayer && (
              <g opacity={1 - candleOpacity}>
                <path d={denseLayer.band} fill="var(--muted-foreground)" opacity={0.14} />
                <path d={denseLayer.line} fill="none" stroke="var(--foreground)" strokeOpacity={0.75} strokeWidth={1.25} />
              </g>
            )}

            {candleOpacity > 0 && !dense && (
              <g opacity={candleOpacity}>
                {Array.from({ length: Math.max(0, i1 - i0) }, (_, k) => {
                  const i = i0 + k
                  const c = candleAt(i)
                  const up = c.close >= c.open
                  const top = y(Math.max(c.open, c.close))
                  const bottom = y(Math.min(c.open, c.close))
                  const body = Math.max(1, slot * 0.62)
                  // A candle rises into place as it's revealed (live only).
                  const grow = live && i === full ? easeOutCubic(clamp(forming * 1.6)) : 1
                  return (
                    // Colours as attributes (not classes): image export only keeps an element's own styles.
                    <g key={i} opacity={0.35 + 0.65 * grow}>
                      <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} stroke={up ? "var(--up)" : "var(--down)"} />
                      <rect
                        x={x(i) - body / 2}
                        y={top}
                        width={body}
                        height={Math.max(bottom - top, 1)}
                        fill={up ? "var(--up)" : "var(--down)"}
                        rx={slot > 8 ? 1 : 0}
                      />
                    </g>
                  )
                })}
              </g>
            )}

            {/* Entry → exit arcs of closed trades, drawn when the exit is reached. */}
            {!busy &&
              tripsInView.map(({ trip, k }) => {
                if (trip.open || trip.exitIndex >= shown || slot < 1) return null
                const a = { x: x(trip.entryIndex), y: markerY("buy", trip.entryIndex) }
                const b = { x: x(trip.exitIndex), y: markerY("sell", trip.exitIndex) }
                const lift = Math.min(36, Math.abs(b.x - a.x) * 0.25 + 10)
                const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift }
                const p = live ? clamp(age(trip.exitIndex) / 0.6) : 1
                return (
                  <path
                    key={`arc-${k}`}
                    d={`M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - easeOutCubic(p)}
                    fill="none"
                    stroke={trip.pnl > 0 ? "var(--up)" : "var(--down)"}
                    strokeOpacity={0.55}
                    strokeWidth={1.25}
                  />
                )
              })}

            {/* Orders */}
            {ordersInView.map(({ trade, n }) => {
              const buy = trade.side === "buy"
              const mx = x(trade.index)
              const my = markerY(trade.side, trade.index)
              const a = live ? age(trade.index) : 9
              const pop = easeOutBack(clamp(a / 0.45))
              const s = (busy ? 3.5 : slot < 4 ? 4 : 5.5) * pop
              const ripple = clamp(a / 0.9)
              const color = buy ? "var(--up)" : "var(--down)"
              const d = buy
                ? `M${mx} ${my - s}L${mx + s} ${my + s * 0.8}L${mx - s} ${my + s * 0.8}Z`
                : `M${mx} ${my + s}L${mx + s} ${my - s * 0.8}L${mx - s} ${my - s * 0.8}Z`
              return (
                <g key={n}>
                  {live && ripple < 1 && (
                    <circle cx={mx} cy={my} r={6 + ripple * 18} fill="none" stroke={color} strokeWidth={1.5} opacity={1 - ripple} />
                  )}
                  <path d={d} fill={color} stroke="var(--card)" strokeWidth={busy ? 0 : 1} />
                </g>
              )
            })}

            {/* Result pill of a trade, floating up from its closing sell. */}
            {live &&
              tripsInView.map(({ trip, k }) => {
                if (trip.open || trip.exitIndex >= shown) return null
                const a = age(trip.exitIndex)
                if (a > 2.4) return null
                const p = clamp(a / 2.4)
                const text = f.signedPct(trip.pnlPct)
                const w = text.length * 6.6 + 16
                const cx = clamp(x(trip.exitIndex), PAD.l + w / 2, W - PAD.r - w / 2)
                const cy = Math.max(markerY("sell", trip.exitIndex) - 26 - p * 18, PAD.t + 10)
                const win = trip.pnl > 0
                return (
                  <g key={`pill-${k}`} opacity={clamp(a / 0.15) * (1 - clamp((p - 0.7) / 0.3))}>
                    <rect x={cx - w / 2} y={cy - 10} width={w} height={20} rx={10} fill="var(--card)" stroke={win ? "var(--up)" : "var(--down)"} strokeWidth={1.5} />
                    <text x={cx} y={cy + 4} textAnchor="middle" className={cn("num text-[11px] font-bold", win ? "fill-up" : "fill-down")}>
                      {text}
                    </text>
                  </g>
                )
              })}

            {/* Playhead */}
            {live && shown > 0 && shown < steps + 1 && revealed < steps && (
              <g transform={`translate(${x(current)} 0)`}>
                <rect x={-34} y={PAD.t - 8} width={34} height={plotH + 8} fill={`url(#${scanId})`} />
                <line x1={0} x2={0} y1={PAD.t - 8} y2={height - PAD.b} stroke="var(--primary)" strokeWidth={1.5} />
                <circle cy={PAD.t - 8} r={3} fill="var(--primary)" />
              </g>
            )}

            {hover?.kind === "candle" && (
              <line x1={hover.x} x2={hover.x} y1={PAD.t - 6} y2={height - PAD.b} stroke="var(--border-strong)" strokeDasharray="3 3" />
            )}
          </g>

          {/* Current close on the price axis. */}
          {live && shown > 0 && (
            <g>
              <rect x={W - PAD.r + 2} y={y(candleAt(current).close) - 9} width={PAD.r - 4} height={18} rx={4} fill="var(--foreground)" />
              <text x={W - PAD.r + 7} y={y(candleAt(current).close) + 3.5} className="num fill-background text-[10px] font-semibold">
                {f.axisPrice(candleAt(current).close)}
              </text>
            </g>
          )}
        </svg>
      )}

      {hoveredTrade && hover?.kind === "trade" && (
        <TradeTooltip
          trade={hoveredTrade}
          trip={result.roundTrips[hoveredTrade.roundTrip] as RoundTrip | undefined}
          rules={rules}
          intraday={intraday}
          x={hover.x}
          y={hover.y}
        />
      )}
      {hoveredCandle && hover?.kind === "candle" && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-md border bg-popover/95 px-2 py-1 text-[11px] text-popover-foreground shadow-sm"
          style={{ left: clamp(hover.x - 90, 4, W - 184) }}
        >
          <p className="num font-semibold">{(intraday ? f.tradeDateTime : f.date).format(new Date(hoveredCandle.time))}</p>
          <p className="num text-muted-foreground">
            {t("A", "O")} {f.price(hoveredCandle.open)} · {t("Máx", "H")} {f.price(hoveredCandle.high)} · {t("Mín", "L")}{" "}
            {f.price(hoveredCandle.low)} · {t("C", "C")} {f.price(hoveredCandle.close)}
          </p>
        </div>
      )}
    </div>
  )
}
