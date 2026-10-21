import { numberFormat } from "@/lib/format"
import type { Locale } from "@/lib/i18n"

// Number formats of the landing figures, in the visitor's language.

/** "+2,48 %" / "+2.48%". `signed` shows "+" on gains. */
export function pct(locale: Locale, value: number, { signed = true, digits = 2 } = {}) {
  const text = numberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value)
  return locale === "es" ? `${text} %` : `${text}%`
}

/** Grouped integer or decimal: "10.000", "0,83". */
export function num(locale: Locale, value: number, digits = 0) {
  return numberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: "always",
  }).format(value)
}

// Dates are spelled out by hand instead of with Intl.DateTimeFormat: these texts are rendered on the
// server and again in the browser, and each ships its own ICU data (month abbreviations, the spaces
// around the "–" of formatRange…), so any difference breaks hydration.

const MONTHS: Record<Locale, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
}

const parts = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() }
}

/** "13 oct" / "Oct 13". */
const dayMonth = (locale: Locale, p: ReturnType<typeof parts>) =>
  locale === "es" ? `${p.day} ${MONTHS.es[p.month]}` : `${MONTHS.en[p.month]} ${p.day}`

/** "13 oct 2025" / "Oct 13, 2025" (UTC). */
export function day(locale: Locale, date: Date | string) {
  const p = parts(date)
  return locale === "es" ? `${dayMonth(locale, p)} ${p.year}` : `${dayMonth(locale, p)}, ${p.year}`
}

/** "13 oct – 11 nov 2025": a date range (UTC), with the year once when both share it. */
export function dayRange(locale: Locale, from: string, to: string) {
  const a = parts(from)
  const b = parts(to)
  return a.year === b.year ? `${dayMonth(locale, a)} – ${day(locale, to)}` : `${day(locale, from)} – ${day(locale, to)}`
}

/** "mar 2025" / "Mar 2025" (UTC). */
export function monthYear(locale: Locale, date: Date | string) {
  const p = parts(date)
  return `${MONTHS[locale][p.month]} ${p.year}`
}

/** "oct 2024 – sep 2026", or "ene – mar 2025" within one year (UTC). */
export function monthRange(locale: Locale, from: string, to: string) {
  const a = parts(from)
  const b = parts(to)
  return a.year === b.year
    ? `${MONTHS[locale][a.month]} – ${monthYear(locale, to)}`
    : `${monthYear(locale, from)} – ${monthYear(locale, to)}`
}

/** "13 oct, 08:00" / "Oct 13, 08:00" (UTC). */
export function dayTime(locale: Locale, date: Date) {
  const p = parts(date)
  const pad2 = (n: number) => String(n).padStart(2, "0")
  return `${dayMonth(locale, p)}, ${pad2(p.hours)}:${pad2(p.minutes)}`
}
