// Display currencies. Client-safe (no server imports).
//
// Market data (prices, volume, market cap) is stored and served in USD; the visitor can view it in
// another currency. The choice is remembered in a cookie, like the language, but it only changes how
// numbers are shown: it is read on the client, so pages stay prerendered. Backtests keep running
// and reporting in USDT, the engine's currency.

export const currencies = ["USD", "EUR"] as const
export type Currency = (typeof currencies)[number]
export const defaultCurrency: Currency = "USD"

/** Remembers the currency picked with the switcher. */
export const CURRENCY_COOKIE = "bl_currency"

export const isCurrency = (value: string): value is Currency => (currencies as readonly string[]).includes(value)

/** Units of each currency per 1 USD. */
export type Rates = Record<Currency, number>
