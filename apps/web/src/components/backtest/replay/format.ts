"use client"

import { useI18n } from "@/components/i18n/locale-provider"
import { intlLocale, type Locale } from "@/lib/i18n"
import { splitDuration } from "@/lib/backtest-report"

/** Number and date formats of one language (built once per language). */
function makeFormats(locale: Locale) {
  const tag = intlLocale[locale]
  const count = new Intl.NumberFormat(tag, { useGrouping: "always" })
  const amount = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })
  const signedAmount = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
    useGrouping: "always",
  })
  const decimal1 = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const signed1 = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" })
  const ratio = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const [p2, p4, p6] = [2, 4, 6].map(
    (digits) => new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: digits, useGrouping: "always" })
  )
  const price = (value: number) => (Math.abs(value) < 1 ? p6 : Math.abs(value) < 100 ? p4 : p2).format(value)
  const sp = locale === "es" ? " " : ""
  const fixed = (digits: number, signed: boolean) =>
    new Intl.NumberFormat(tag, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: signed ? "exceptZero" : "auto",
      useGrouping: "always",
    })
  const plainPct = [0, 1, 2].map((d) => fixed(d, false))
  const signPct = [0, 1, 2].map((d) => fixed(d, true))
  const digitsOf = (d: number) => Math.max(0, Math.min(2, d))
  // Large prices don't need cents on an axis or a tag (and they'd overflow it).
  const axisPrice = (value: number) => (Math.abs(value) >= 10_000 ? count.format(Math.round(value)) : price(value))
  return {
    count,
    amount,
    signedAmount,
    decimal1,
    ratio,
    price,
    axisPrice,
    /** "12,4 %" / "12.4%" (0 to 2 decimals). */
    pct: (value: number, digits = 1) => `${plainPct[digitsOf(digits)].format(value)}${sp}%`,
    /** "+12,4 %" / "+12.4%" (0 to 2 decimals). */
    signedPct: (value: number, digits = 1) => `${signPct[digitsOf(digits)].format(value)}${sp}%`,
    /** "+3,1 pts". */
    pts: (value: number) => `${signed1.format(value)} pts`,
    /** "1 ganada" / "3 ganadas": picks the form by the count. */
    plural: (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`,
    usdt: (value: number, signed = false) => `${(signed ? signedAmount : amount).format(value)} USDT`,
    /** Compact USDT for axes: "12,4 k". */
    compact: new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }),
    tradeDateTime: new Intl.DateTimeFormat(tag, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }),
    date: new Intl.DateTimeFormat(tag, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
    axisDate: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }),
    axisDateTime: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
    month: new Intl.DateTimeFormat(tag, { month: "short", year: "2-digit", timeZone: "UTC" }),
    /** "3 d 4 h" / "5 h 20 min" / "15 min". */
    duration: (seconds: number) => {
      const { days, hours, minutes } = splitDuration(seconds)
      const d = locale === "es" ? "d" : "d"
      if (days >= 1) return hours ? `${count.format(days)} ${d} ${hours} h` : `${count.format(days)} ${d}`
      if (hours >= 1) return minutes ? `${hours} h ${minutes} min` : `${hours} h`
      return `${minutes} min`
    },
  }
}

export type ReplayFormats = ReturnType<typeof makeFormats>

const formatsByLocale: Record<Locale, ReplayFormats> = { es: makeFormats("es"), en: makeFormats("en") }

/** Formats and translator of the page's language. */
export function useReplayText() {
  const i18n = useI18n()
  return { ...i18n, f: formatsByLocale[i18n.locale] }
}

/** "up" / "down" / undefined by sign, for colouring figures. */
export const sign = (value: number | null | undefined) =>
  value == null ? undefined : value > 0 ? ("up" as const) : value < 0 ? ("down" as const) : undefined
