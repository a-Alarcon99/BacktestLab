import { cacheLife } from "next/cache"
import type { Rates } from "@/lib/currency"

/**
 * Euros per US dollar (ECB reference rate through Frankfurter). `null` if the provider fails: the
 * site then only offers dollars. Cached for hours, so it is part of the prerendered shell.
 */
export async function getRates(): Promise<Rates | null> {
  "use cache"
  cacheLife("hours")
  try {
    const response = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const eur = ((await response.json()) as { rates?: { EUR?: number } }).rates?.EUR
    return typeof eur === "number" && eur > 0 ? { USD: 1, EUR: eur } : null
  } catch {
    return null
  }
}
