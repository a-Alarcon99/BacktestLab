import type { Locale } from "@/lib/i18n"

// Display names of the asset categories. The `categories` table holds the Spanish name, which stays
// the filter value; only the label shown changes with the language.
const english: Record<string, string> = { Pagos: "Payments", Oráculos: "Oracles" }

export function categoryLabel(name: string, locale: Locale) {
  return locale === "en" ? (english[name] ?? name) : name
}
