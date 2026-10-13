import { cn } from "cn"
import { formatPrice } from "@/lib/format"
import type { Candle } from "@/lib/candles"

/**
 * Single-series price chart (static SVG) with recessive horizontal grid, price ticks on the right
 * and a dashed reference line at the first close.
 * - `line`: 2px close line in the trend color with a soft gradient fill.
 * - `candles`: OHLC candlesticks, each colored by its own direction (close vs. open).
 */
function PriceChart({
  id,
  candles,
  type = "line",
  className,
}: {
  id: string
  /** At least 2 candles, oldest first. */
  candles: Candle[]
  type?: "line" | "candles"
  className?: string
}) {
  const closes = candles.map((c) => c.close)
  const min = Math.min(...(type === "candles" ? candles.map((c) => c.low) : closes))
  const max = Math.max(...(type === "candles" ? candles.map((c) => c.high) : closes))
  const range = max - min || 1
  const W = 1000
  const H = 360
  const x = (i: number) => (i / (closes.length - 1)) * W
  const y = (p: number) => 12 + (1 - (p - min) / range) * (H - 24)

  const first = closes[0]
  const last = closes[closes.length - 1]
  const up = last >= first
  const ticks = Array.from({ length: 5 }, (_, i) => max - (range * i) / 4)

  return (
    <div className={cn("flex gap-3", up ? "text-up" : "text-down", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evolución del precio de ${formatPrice(first)} a ${formatPrice(last)}`}
        className="h-64 min-w-0 flex-1 md:h-80"
      >
        {ticks.map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={0}
          x2={W}
          y1={y(first)}
          y2={y(first)}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          strokeOpacity={0.5}
          vectorEffect="non-scaling-stroke"
        />
        {type === "candles" ? (
          <Candlesticks candles={candles} width={W} y={y} />
        ) : (
          <Line id={id} values={closes} x={x} y={y} width={W} height={H} />
        )}
      </svg>
      <div className="num relative hidden w-20 shrink-0 text-caption text-muted-foreground sm:block">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${(y(t) / H) * 100}%` }}
          >
            {formatPrice(t)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Line({
  id,
  values,
  x,
  y,
  width,
  height,
}: {
  id: string
  values: number[]
  x: (i: number) => number
  y: (p: number) => number
  width: number
  height: number
}) {
  const line = values.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("")
  const area = `${line}L${width},${height}L0,${height}Z`
  return (
    <>
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.16} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#fill-${id})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
}

/** One slot per candle: 1px wick from high to low, body from open to close (60% of the slot). */
function Candlesticks({ candles, width, y }: { candles: Candle[]; width: number; y: (p: number) => number }) {
  const slot = width / candles.length
  const body = slot * 0.6
  return candles.map((c, i) => {
    const cx = (i + 0.5) * slot
    const top = y(Math.max(c.open, c.close))
    const bottom = y(Math.min(c.open, c.close))
    return (
      <g key={c.time} className={c.close >= c.open ? "text-up" : "text-down"}>
        <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke="currentColor" vectorEffect="non-scaling-stroke" />
        <rect x={cx - body / 2} y={top} width={body} height={Math.max(bottom - top, 1)} fill="currentColor" />
      </g>
    )
  })
}

export { PriceChart }
