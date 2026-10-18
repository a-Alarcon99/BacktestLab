import { siteConfig } from "@/config/site"
import { isLocale } from "@/lib/i18n"
import { ogContentType, ogImage, ogSize } from "@/lib/og-image"

export const alt = siteConfig.name
export const size = ogSize
export const contentType = ogContentType

/** Card image of every page without its own (home, strategies…). */
export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const locale = isLocale(lang) ? lang : "es"
  return ogImage({
    title: locale === "en" ? "Crypto strategy backtesting" : "Backtesting de estrategias cripto",
    subtitle: siteConfig.description[locale],
  })
}
