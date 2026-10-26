"use client"

import { useRef, useState } from "react"
import { cn } from "cn"
import { clamp } from "@/lib/chart-geometry"
import { InfoHint } from "../report/parts"

// Hover kit of the result charts: the pointer read in the SVG's own coordinates, a crosshair and a
// small HTML card that follows it. The charts scale with `viewBox`, so the card is placed in % of
// the SVG and stays aligned at any width. Touch works too (a tap or a drag moves the reading).

export type HoverPoint = { x: number; y: number }

/**
 * Pointer position in viewBox units (`width` × `height`), `null` when the pointer is outside.
 * Spread `bind` on the `<svg>`.
 */
export function useChartHover(width: number, height: number) {
  const ref = useRef<SVGSVGElement>(null)
  const [at, setAt] = useState<HoverPoint | null>(null)
  const read = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return
    setAt({ x: ((e.clientX - box.left) / box.width) * width, y: ((e.clientY - box.top) / box.height) * height })
  }
  return {
    at,
    clear: () => setAt(null),
    bind: { ref, onPointerMove: read, onPointerDown: read, onPointerLeave: () => setAt(null) },
  }
}

/** Index of the slot under `x` when `count` slots share [x0, x1] evenly (points of a curve). */
export const indexAtX = (x: number, x0: number, x1: number, count: number) => (count <= 1 ? 0 : Math.round(clamp((x - x0) / (x1 - x0)) * (count - 1)))

/**
 * Card that follows a point of the chart (`x`, `y` in viewBox units). The chart's wrapper must be
 * `relative`. It flips to the left on the right half so it never leaves the chart.
 */
export function ChartTip({ x, y, width, height, children, className }: { x: number; y: number; width: number; height: number; children: React.ReactNode; className?: string }) {
  const left = clamp(x / width) * 100
  const top = clamp(y / height, 0.12, 0.88) * 100
  const flip = left > 55
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-20 flex min-w-36 flex-col gap-1 rounded-lg border bg-popover/95 px-2.5 py-2 text-[11px] text-popover-foreground shadow-lg backdrop-blur-sm",
        className
      )}
      style={{ left: `${left}%`, top: `${top}%`, transform: `translate(${flip ? "calc(-100% - 14px)" : "14px"}, -50%)` }}
    >
      {children}
    </div>
  )
}

/** Heading line of a `ChartTip`. */
export function TipTitle({ children }: { children: React.ReactNode }) {
  return <p className="num font-semibold text-foreground">{children}</p>
}

/** One "label … value" line of a `ChartTip`, with an optional colour swatch. */
export function TipRow({ label, value, colour, valueColour, dashed, strong }: { label: string; value: string; colour?: string; valueColour?: string; dashed?: boolean; strong?: boolean }) {
  return (
    <p className="flex items-center gap-2">
      {colour && (dashed ? <span aria-hidden className="h-0 w-3 shrink-0 border-t-2 border-dashed" style={{ borderColor: colour }} /> : <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: colour }} />)}
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className={cn("num pl-2 text-right", strong ? "font-bold" : "font-semibold")} style={valueColour ? { color: valueColour } : undefined}>
        {value}
      </span>
    </p>
  )
}

/** Vertical guide of the crosshair, from `top` to `bottom` at `x`. */
export function Crosshair({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  return <line x1={x} x2={x} y1={top} y2={bottom} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} pointerEvents="none" />
}

/** Dot of a series under the crosshair. */
export function HoverDot({ x, y, colour, r = 4.5 }: { x: number; y: number; colour: string; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={colour} stroke="var(--card)" strokeWidth={2} pointerEvents="none" />
}

/** "?" next to a label: the longer explanation of a figure, in a pop-over. */
export function Hint({ title, children }: { title: string; children: React.ReactNode }) {
  return <InfoHint title={title}>{typeof children === "string" ? <p>{children}</p> : children}</InfoHint>
}
