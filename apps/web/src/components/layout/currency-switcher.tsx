"use client"

import { cn } from "cn"
import { useCurrency } from "@/components/currency/currency-provider"
import { useLocale } from "@/components/i18n/locale-provider"
import { currencies, type Currency } from "@/lib/currency"

const symbols: Record<Currency, string> = { USD: "$", EUR: "€" }

/** USD / EUR toggle: changes the currency market figures are shown in and remembers it in a cookie. */
function CurrencySwitcher({ className }: { className?: string }) {
  const { currency: current, available, setCurrency } = useCurrency()
  const en = useLocale() === "en"
  return (
    <div
      role="group"
      aria-label={en ? "Currency" : "Divisa"}
      className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}
    >
      {currencies.map((currency) => {
        const active = currency === current
        return (
          <button
            key={currency}
            type="button"
            disabled={!available.includes(currency)}
            aria-pressed={active}
            title={currency}
            onClick={() => setCurrency(currency)}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2 text-caption font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
              active ? "bg-background text-foreground shadow-sm dark:bg-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {symbols[currency]}
          </button>
        )
      })}
    </div>
  )
}

export { CurrencySwitcher }
