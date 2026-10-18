import { defaultLocale, intlLocale, type Locale } from "@/lib/i18n"

export function formatPrice(value: number, locale: Locale = defaultLocale, currency = "USD") {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value)
}

/** Compact currency for large figures: "1,26 B US$", "412 M US$" ("$1.26B" in English). */
export function formatCompact(value: number, locale: Locale = defaultLocale, currency = "USD") {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(iso: string, locale: Locale = defaultLocale) {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso))
}

/**
 * Plain number in the locale's format. es-ES skips grouping for 4-digit numbers by default
 * ("6570"): `useGrouping: "always"` forces "6.570".
 */
export function numberFormat(locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(intlLocale[locale], options)
}
