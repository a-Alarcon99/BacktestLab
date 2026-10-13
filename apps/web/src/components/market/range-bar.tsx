import { formatPrice } from "@/lib/format"

/** Low–high bar with a marker at the current price. */
function RangeBar({
  label,
  low,
  high,
  current,
}: {
  label: string
  low: number
  high: number
  current: number
}) {
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low || 1)) * 100))
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption font-semibold text-muted-foreground">{label}</span>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-down via-muted-foreground/40 to-up"
          style={{ width: `${pct}%` }}
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="num flex justify-between text-caption">
        <span>
          <span className="text-muted-foreground">Mín. </span>
          {formatPrice(low)}
        </span>
        <span>
          <span className="text-muted-foreground">Máx. </span>
          {formatPrice(high)}
        </span>
      </div>
    </div>
  )
}

export { RangeBar }
