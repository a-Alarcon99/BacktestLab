import { Money } from "@/components/currency/currency-provider"
import { defaultLocale, translator, type Locale } from "@/lib/i18n"

/** Low–high bar with a marker at the current price. */
function RangeBar({
  label,
  low,
  high,
  current,
  locale = defaultLocale,
}: {
  label: string
  low: number
  high: number
  current: number
  locale?: Locale
}) {
  const t = translator(locale)
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
          <span className="text-muted-foreground">{t("Mín. ", "Low ")}</span>
          <Money value={low} />
        </span>
        <span>
          <span className="text-muted-foreground">{t("Máx. ", "High ")}</span>
          <Money value={high} />
        </span>
      </div>
    </div>
  )
}

export { RangeBar }
