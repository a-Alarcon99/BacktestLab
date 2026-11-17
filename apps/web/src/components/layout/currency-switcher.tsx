"use client"

import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"
import { useCurrency } from "@/components/currency/currency-provider"
import { useLocale } from "@/components/i18n/locale-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { currencies, isCurrency, type Currency } from "@/lib/currency"

const symbols: Record<Currency, string> = { USD: "$", EUR: "€" }

/** Currency dropdown: changes the currency market figures are shown in and remembers it in a cookie. */
function CurrencySwitcher({ className }: { className?: string }) {
  const { currency: current, available, setCurrency } = useCurrency()
  const en = useLocale() === "en"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={en ? "Currency" : "Divisa"}
        className={cn(
          "h-9 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-caption font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted",
          className ?? "inline-flex"
        )}
      >
        <span className="w-3 text-muted-foreground">{symbols[current]}</span>
        <span>{current}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => isCurrency(value) && setCurrency(value)}>
          {currencies.map((currency) => (
            <DropdownMenuRadioItem key={currency} value={currency} disabled={!available.includes(currency)}>
              <span className="w-3 text-muted-foreground">{symbols[currency]}</span>
              {currency}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { CurrencySwitcher }
