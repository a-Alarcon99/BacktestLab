"use client"

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react"
import { useLocale } from "@/components/i18n/locale-provider"
import { CURRENCY_COOKIE, defaultCurrency, isCurrency, type Currency, type Rates } from "@/lib/currency"
import { formatCompact, formatPrice } from "@/lib/format"

type CurrencyContextValue = {
  /** Currency numbers are shown in (USD while the rates are unavailable). */
  currency: Currency
  /** Currencies that can be picked: only USD when the exchange rate could not be loaded. */
  available: readonly Currency[]
  setCurrency: (currency: Currency) => void
  /** USD amount in the current currency. */
  convert: (usd: number) => number
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: defaultCurrency,
  available: [defaultCurrency],
  setCurrency: () => {},
  convert: (usd) => usd,
})

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function readCookie(): Currency {
  const value = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]*)`))?.[1]
  return value && isCurrency(value) ? value : defaultCurrency
}

/**
 * Display currency for Client Components (set by the root layout with the exchange rates). The
 * server and the first client render use USD; the remembered choice is applied right after.
 */
function CurrencyProvider({ rates, children }: { rates: Rates | null; children: React.ReactNode }) {
  const saved = useSyncExternalStore(subscribe, readCookie, () => defaultCurrency)
  const currency = rates ? saved : defaultCurrency
  const setCurrency = useCallback((next: Currency) => {
    document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    listeners.forEach((listener) => listener())
  }, [])
  const value = useMemo<CurrencyContextValue>(() => {
    const rate = rates?.[currency] ?? 1
    return {
      currency,
      available: rates ? (Object.keys(rates) as Currency[]) : [defaultCurrency],
      setCurrency,
      convert: (usd) => usd * rate,
    }
  }, [rates, currency, setCurrency])
  return <CurrencyContext value={value}>{children}</CurrencyContext>
}

function useCurrency() {
  return useContext(CurrencyContext)
}

/** Formatters for USD amounts in the visitor's language and display currency. */
function useMoney() {
  const locale = useLocale()
  const { currency, convert } = useCurrency()
  return useMemo(
    () => ({
      currency,
      convert,
      price: (usd: number) => formatPrice(convert(usd), locale, currency),
      compact: (usd: number) => formatCompact(convert(usd), locale, currency),
    }),
    [locale, currency, convert]
  )
}

/** A USD amount shown in the display currency (usable from Server Components). */
function Money({ value, compact }: { value: number; compact?: boolean }) {
  const money = useMoney()
  return compact ? money.compact(value) : money.price(value)
}

export { CurrencyProvider, Money, useCurrency, useMoney }
