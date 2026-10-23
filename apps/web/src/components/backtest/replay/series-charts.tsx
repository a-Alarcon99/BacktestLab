"use client"

import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "cn"
import type { BacktestResult } from "@/lib/backtests"
import { clamp, linePath, niceTicks, type Point } from "@/lib/chart-geometry"
import { useWidth } from "@/lib/motion"
import { useReplayText } from "./format"
import type { View } from "./price-chart"

// Equity vs buy-and-hold and drawdown panels of the replay. They share the price chart's x axis
// (`view`) and reveal up to the playback position.

const PAD = { l: 8, r: 68, t: 10, b: 6 }

function useSeriesFrame(result: BacktestResult, view: View, revealed: number, height: number) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const W = Math.max(width, 1)
  const plotW = Math.max(W - PAD.l - PAD.r, 1)
  const span = Math.max(view.end - view.start, 1)
  const slot = plotW / span
  const x = (i: number) => PAD.l + (i - view.start + 0.5) * slot
  const shown = Math.min(result.candles.length, Math.ceil(revealed))
  const i0 = Math.max(0, Math.floor(view.start))
  const i1 = Math.min(shown, Math.ceil(view.end))
  // Long views are sampled: about two points per pixel is plenty for a line.
  const step = Math.max(1, Math.floor((i1 - i0) / (plotW * 2)))
  const indices: number[] = []
  for (let i = i0; i < i1; i += step) indices.push(i)
  if (i1 > i0 && indices[indices.length - 1] !== i1 - 1) indices.push(i1 - 1)
  return { ref, width, W, plotW, slot, x, shown, indices, height, last: i1 - 1 }
}

function useHoverIndex(frame: ReturnType<typeof useSeriesFrame>, view: View, enabled: boolean) {
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!enabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = Math.round(view.start + (px - PAD.l) / frame.slot - 0.5)
    setHover(i >= 0 && i < frame.shown ? i : null)
  }
  return { hover, onMove, onLeave: () => setHover(null) }
}

/** Two value tags at the right edge that never overlap. */
function spreadTags(a: number, b: number, gap = 17): [number, number] {
  if (Math.abs(a - b) >= gap) return [a, b]
  const mid = (a + b) / 2
  return a <= b ? [mid - gap / 2, mid + gap / 2] : [mid + gap / 2, mid - gap / 2]
}

export function EquityChart({
  result,
  capital,
  view,
  revealed,
  live,
  height,
  interactive,
  label,
  className,
}: {
  result: BacktestResult
  capital: number
  view: View
  revealed: number
  live: boolean
  height: number
  interactive: boolean
  label: string
  className?: string
}) {
  const { t, f } = useReplayText()
  const frame = useSeriesFrame(result, view, revealed, height)
  const { ref, width, W, x, indices, last } = frame
  const { hover, onMove, onLeave } = useHoverIndex(frame, view, interactive)
  const id = useId()

  let lo = capital
  let hi = capital
  for (const i of indices) {
    lo = Math.min(lo, result.equity[i], result.benchmark[i])
    hi = Math.max(hi, result.equity[i], result.benchmark[i])
  }
  const margin = (hi - lo) * 0.1 || capital * 0.01
  lo -= margin
  hi += margin
  const plotH = height - PAD.t - PAD.b
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * plotH
  const strategy: Point[] = indices.map((i) => ({ x: x(i), y: y(result.equity[i]) }))
  const bench: Point[] = indices.map((i) => ({ x: x(i), y: y(result.benchmark[i]) }))
  const ticks = niceTicks(lo, hi, Math.max(2, Math.round(plotH / 44)))
  const between = strategy.length
    ? `${linePath(strategy)}${[...bench].reverse().map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("")}Z`
    : ""
  const benchLine = linePath(bench)
  const above = bench.length ? `${benchLine}L${bench[bench.length - 1].x} 0L${bench[0].x} 0Z` : ""
  const below = bench.length ? `${benchLine}L${bench[bench.length - 1].x} ${height}L${bench[0].x} ${height}Z` : ""
  const end = last >= 0 ? { s: y(result.equity[last]), b: y(result.benchmark[last]) } : null
  const [tagS, tagB] = end ? spreadTags(end.s, end.b) : [0, 0]
  const ret = last >= 0 ? (result.equity[last] / capital - 1) * 100 : 0
  const bret = last >= 0 ? (result.benchmark[last] / capital - 1) * 100 : 0

  return (
    <div ref={ref} className={cn("relative select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={onLeave} className="block">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${id}-above`}>
              <path d={above} />
            </clipPath>
            <clipPath id={`${id}-below`}>
              <path d={below} />
            </clipPath>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              {/* Hidden where the end tags sit, so they never overlap. */}
              {!(end && (Math.abs(y(v) - tagS) < 15 || Math.abs(y(v) - tagB) < 15)) && (
                <text x={W - PAD.r + 8} y={y(v) + 3.5} className="num fill-muted-foreground text-[10px]">
                  {f.compact.format(v)}
                </text>
              )}
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(capital)} y2={y(capital)} stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeDasharray="2 4" />

          {strategy.length > 1 && (
            <>
              {/* The gap with buy and hold: green where the strategy is ahead, red where behind. */}
              <path d={between} fill="var(--up)" opacity={0.16} clipPath={`url(#${id}-above)`} />
              <path d={between} fill="var(--down)" opacity={0.16} clipPath={`url(#${id}-below)`} />
              <path
                d={`${linePath(strategy)}L${strategy[strategy.length - 1].x} ${height}L${strategy[0].x} ${height}Z`}
                fill={`url(#${id}-fill)`}
                opacity={0.6}
              />
              <path d={benchLine} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.25} strokeDasharray="4 3" />
              <path d={linePath(strategy)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
            </>
          )}

          {end && (
            <>
              <circle cx={x(last)} cy={end.b} r={2.5} fill="var(--muted-foreground)" />
              {live && (
                <circle
                  className="lp-anim lp-box"
                  cx={x(last)}
                  cy={end.s}
                  r={6}
                  fill="var(--primary)"
                  opacity={0.3}
                  style={{ animation: "lp-breathe 1.8s ease-in-out infinite" }}
                />
              )}
              <circle cx={x(last)} cy={end.s} r={3.5} fill="var(--primary)" />
              <g>
                <rect x={W - PAD.r + 2} y={tagS - 9} width={PAD.r - 4} height={18} rx={4} fill="var(--primary)" />
                <text x={W - PAD.r + 7} y={tagS + 3.5} className="num fill-primary-foreground text-[10px] font-bold">
                  {f.signedPct(ret)}
                </text>
                <rect x={W - PAD.r + 2} y={tagB - 9} width={PAD.r - 4} height={18} rx={4} fill="var(--muted)" stroke="var(--border-strong)" />
                <text x={W - PAD.r + 7} y={tagB + 3.5} className="num fill-muted-foreground text-[10px] font-semibold">
                  {f.signedPct(bret)}
                </text>
              </g>
            </>
          )}

          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="var(--border-strong)" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(result.equity[hover])} r={3} fill="var(--primary)" />
              <circle cx={x(hover)} cy={y(result.benchmark[hover])} r={2.5} fill="var(--muted-foreground)" />
            </g>
          )}
        </svg>
      )}
      <div className="pointer-events-none absolute top-1.5 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1.5 text-primary">
          <span className="h-0.5 w-3 rounded bg-primary" />
          {t("Tu estrategia", "Your strategy")}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="w-3 border-t border-dashed border-muted-foreground" />
          {t("Comprar y mantener", "Buy and hold")}
        </span>
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-md border bg-popover/95 px-2 py-1 text-[11px] shadow-sm"
          style={{ left: clamp(x(hover) - 80, 4, W - 172) }}
        >
          <p className="num font-semibold">{f.date.format(new Date(result.candles[hover].time))}</p>
          <p className="num text-primary">
            {t("Estrategia", "Strategy")} {f.usdt(result.equity[hover])}
          </p>
          <p className="num text-muted-foreground">
            {t("Comprar y mantener", "Buy and hold")} {f.usdt(result.benchmark[hover])}
          </p>
        </div>
      )}
    </div>
  )
}

export function DrawdownChart({
  result,
  view,
  revealed,
  cps,
  live,
  height,
  interactive,
  showLongest,
  label,
  className,
}: {
  result: BacktestResult
  view: View
  revealed: number
  cps: number
  live: boolean
  height: number
  interactive: boolean
  showLongest: boolean
  label: string
  className?: string
}) {
  const { t, f } = useReplayText()
  const frame = useSeriesFrame(result, view, revealed, height)
  const { ref, width, W, x, indices, shown } = frame
  const { hover, onMove, onLeave } = useHoverIndex(frame, view, interactive)
  const id = useId()

  // Deepest fall so far (over everything revealed, not only the view).
  let worst = 0
  let worstAt = -1
  for (let i = 0; i < shown; i++) {
    if (result.drawdown[i] > worst) {
      worst = result.drawdown[i]
      worstAt = i
    }
  }
  let depth = 1
  for (const i of indices) depth = Math.max(depth, result.drawdown[i], result.benchmarkDrawdown[i])
  depth *= 1.15
  // Room above the zero line for the panel's title.
  const top = PAD.t + 16
  const plotH = height - top - PAD.b - (showLongest ? 16 : 0)
  const y = (v: number) => top + (v / depth) * plotH
  const pts: Point[] = indices.map((i) => ({ x: x(i), y: y(result.drawdown[i]) }))
  const bench: Point[] = indices.map((i) => ({ x: x(i), y: y(result.benchmarkDrawdown[i]) }))
  const area = pts.length ? `${linePath(pts)}L${pts[pts.length - 1].x} ${y(0)}L${pts[0].x} ${y(0)}Z` : ""
  const ticks = niceTicks(0, depth, Math.max(1, Math.round(plotH / 30))).filter((v) => v <= depth)
  const fresh = live && worstAt >= 0 ? (revealed - worstAt - 1) / cps : 9
  const longest = showLongest ? result.metrics.longestDrawdown : null

  return (
    <div ref={ref} className={cn("relative select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={onLeave} className="block">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--down)" stopOpacity="0.08" />
              <stop offset="1" stopColor="var(--down)" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : "2 4"} />
              <text x={W - PAD.r + 8} y={y(v) + 3.5} className="num fill-muted-foreground text-[10px]">
                {v === 0 ? "0" : f.signedPct(-v, 1)}
              </text>
            </g>
          ))}
          {pts.length > 1 && (
            <>
              <path d={area} fill={`url(#${id}-fill)`} />
              <path d={linePath(bench)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
              <path d={linePath(pts)} fill="none" stroke="var(--down)" strokeWidth={1.5} strokeLinejoin="round" />
            </>
          )}
          {worstAt >= view.start - 1 && worstAt <= view.end && worst > 0 && (
            <g>
              {fresh < 0.9 && (
                <circle cx={x(worstAt)} cy={y(worst)} r={4 + clamp(fresh / 0.9) * 14} fill="none" stroke="var(--down)" opacity={1 - clamp(fresh / 0.9)} />
              )}
              <circle cx={x(worstAt)} cy={y(worst)} r={3} fill="var(--down)" stroke="var(--card)" strokeWidth={1} />
              <text
                x={clamp(x(worstAt), PAD.l + 34, W - PAD.r - 34)}
                y={Math.min(y(worst) + 15, height - 4)}
                textAnchor="middle"
                className="num fill-down text-[10px] font-bold"
              >
                {f.signedPct(-worst)}
              </text>
            </g>
          )}
          {longest && longest.endIndex >= view.start && longest.startIndex <= view.end && (
            <g>
              <path
                d={`M${x(longest.startIndex)} ${height - 14}v4H${x(longest.endIndex)}v-4`}
                fill="none"
                stroke="var(--chart-3)"
                strokeWidth={1.25}
              />
              <text
                x={clamp((x(longest.startIndex) + x(longest.endIndex)) / 2, PAD.l + 80, W - PAD.r - 80)}
                y={height - 1}
                textAnchor="middle"
                className="num fill-muted-foreground text-[10px] font-semibold"
              >
                {longest.recovered
                  ? t(`Mayor tiempo en pérdidas: ${f.duration(longest.seconds)}`, `Longest time under water: ${f.duration(longest.seconds)}`)
                  : t(`Sin recuperar tras ${f.duration(longest.seconds)}`, `Not recovered after ${f.duration(longest.seconds)}`)}
              </text>
            </g>
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="var(--border-strong)" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(result.drawdown[hover])} r={3} fill="var(--down)" />
            </g>
          )}
        </svg>
      )}
      <div className="pointer-events-none absolute top-1 left-2 text-[11px] font-semibold text-muted-foreground">
        {t("Caída desde el máximo", "Fall from the peak")}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute bottom-1 z-10 rounded-md border bg-popover/95 px-2 py-1 text-[11px] shadow-sm"
          style={{ left: clamp(x(hover) - 80, 4, W - 172) }}
        >
          <p className="num font-semibold">{f.date.format(new Date(result.candles[hover].time))}</p>
          <p className="num text-down">
            {t("Estrategia", "Strategy")} {f.signedPct(-result.drawdown[hover])}
          </p>
          <p className="num text-muted-foreground">
            {t("Comprar y mantener", "Buy and hold")} {f.signedPct(-result.benchmarkDrawdown[hover])}
          </p>
        </div>
      )}
    </div>
  )
}
