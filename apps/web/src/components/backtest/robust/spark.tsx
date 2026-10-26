"use client"

import { linePath } from "@/lib/chart-geometry"
import { signVar } from "./viz"

/** A tiny line of an equity curve (normalized to 100), optionally against buy and hold's; green or red by how it ends. */
export function Spark({ curve, hold, width = 96, height = 28, className }: { curve: number[]; hold?: number[]; width?: number; height?: number; className?: string }) {
  if (curve.length < 2) return null
  const all = [100, ...curve, ...(hold ?? [])]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = hi - lo || 1
  const point = (v: number, k: number, length: number) => ({ x: 1 + (k / Math.max(1, length - 1)) * (width - 2), y: height - 2 - ((v - lo) / span) * (height - 4) })
  const colour = signVar((curve.at(-1) ?? 100) - 100)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <line x1={0} x2={width} y1={point(100, 0, 2).y} y2={point(100, 0, 2).y} stroke="var(--border-strong)" strokeDasharray="2 3" />
      {hold && hold.length > 1 && <path d={linePath(hold.map((v, k) => point(v, k, hold.length)))} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />}
      <path d={linePath(curve.map((v, k) => point(v, k, curve.length)))} fill="none" stroke={colour} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
