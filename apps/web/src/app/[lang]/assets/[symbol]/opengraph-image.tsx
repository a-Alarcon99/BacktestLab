import { siteConfig } from "@/config/site"
import { isLocale } from "@/lib/i18n"
import { getAssetInfo } from "@/lib/market"
import { ogContentType, ogImage, ogSize } from "@/lib/og-image"

export const alt = `${siteConfig.name} · Backtest`
export const size = ogSize
export const contentType = ogContentType

/** Card image of an asset page: its name and symbol. */
export default async function Image({ params }: { params: Promise<{ lang: string; symbol: string }> }) {
  const { lang, symbol } = await params
  const en = isLocale(lang) && lang === "en"
  const info = await getAssetInfo(symbol)
  const name = info ? `${info.name} (${info.symbol})` : symbol.toUpperCase()
  return ogImage({
    eyebrow: en ? "Backtest" : "Backtest de",
    title: name,
    subtitle: en
      ? `Test trading strategies on ${info?.symbol ?? symbol.toUpperCase()}/USDT over any date range and timeframe.`
      : `Prueba estrategias de trading sobre ${info?.symbol ?? symbol.toUpperCase()}/USDT en cualquier rango de fechas y temporalidad.`,
  })
}
