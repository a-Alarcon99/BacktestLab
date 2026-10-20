import { TriangleIcon } from "lucide-react"
import { cn } from "cn"
import { defaultLocale, intlLocale, type Locale } from "@/lib/i18n"

const percent: Record<Locale, Intl.NumberFormat> = {
  es: new Intl.NumberFormat(intlLocale.es, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat(intlLocale.en, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}

/** Signed percentage, colored by direction. `value` is a percentage (2.5 = +2.50%). */
function PriceChange({
  value,
  variant = "text",
  locale = defaultLocale,
  className,
}: {
  value: number
  variant?: "text" | "pill"
  /** Server callers pass it; client callers may too (Spanish otherwise). */
  locale?: Locale
  className?: string
}) {
  const up = value >= 0
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 font-semibold",
        up ? "text-up" : "text-down",
        variant === "pill" &&
          (up ? "bg-up-soft" : "bg-down-soft") + " h-7 rounded-md px-2",
        className
      )}
    >
      <TriangleIcon
        aria-hidden
        className={cn("size-2.5 fill-current", !up && "rotate-180")}
      />
      <span className="sr-only">{locale === "en" ? (up ? "Up" : "Down") : up ? "Sube" : "Baja"}</span>
      {percent[locale].format(Math.abs(value))}%
    </span>
  )
}

export { PriceChange }
