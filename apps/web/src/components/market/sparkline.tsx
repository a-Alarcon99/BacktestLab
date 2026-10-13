import { cn } from "cn"

/** Tiny trend line for tables/cards. Color encodes direction (first vs last point). */
function Sparkline({
  values,
  width = 120,
  height = 36,
  className,
}: {
  values: number[]
  width?: number
  height?: number
  className?: string
}) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = 2
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  const up = values[values.length - 1] >= values[0]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
      className={cn(up ? "text-up" : "text-down", className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export { Sparkline }
