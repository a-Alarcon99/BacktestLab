"use client"

import { useEffect, useRef, useState } from "react"
import { areaPath, extent, linePath, linear, pad } from "@/lib/chart-geometry"
import { useInView, useReducedMotion } from "@/lib/motion"

const W = 240
const H = 64

/**
 * Small equity curve (normalized to 100 at the start) that draws itself when scrolled into view.
 * Rendered finished on the server; curves already on screen at load don't animate.
 */
function EquityLine({ curve, label }: { curve: number[]; label: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const seen = useInView(ref, { once: true })
  const reduced = useReducedMotion()
  // Armed = below the fold at load: hidden until it scrolls into view, then drawn once.
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (reduced || !element) return
    if (element.getBoundingClientRect().top >= window.innerHeight) setArmed(true)
  }, [reduced])

  const [lo, hi] = pad(extent([...curve, 100]), 0.1)
  const y = linear(lo, hi, H - 4, 4)
  const points = curve.map((v, i) => ({ x: (i / (curve.length - 1)) * W, y: y(v) }))
  const end = curve[curve.length - 1]
  const color = end >= 100 ? "var(--up)" : "var(--down)"
  const hidden = armed && !seen
  const drawing = armed && seen

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-16 w-full overflow-visible" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={y(100)} y2={y(100)} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="2 4" />
      <path
        d={areaPath(points, H)}
        fill={color}
        style={{ opacity: hidden ? 0 : 0.1, transition: "opacity 600ms ease 900ms" }}
      />
      <path
        d={linePath(points)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={hidden ? 1 : 0}
        style={drawing ? { transition: "stroke-dashoffset 1400ms cubic-bezier(.22,1,.36,1)" } : undefined}
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={3}
        fill={color}
        style={{ opacity: hidden ? 0 : 1, transition: drawing ? "opacity 300ms ease 1300ms" : undefined }}
      />
    </svg>
  )
}

export { EquityLine }
