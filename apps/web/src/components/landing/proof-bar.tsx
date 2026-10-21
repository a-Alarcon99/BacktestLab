import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { candlePatterns } from "@/lib/candle-patterns"
import { maxBacktestCandles, timeframes } from "@/lib/candles"
import { getI18n } from "@/lib/i18n-server"
import { CountUp } from "./art/count-up"

/** Section 2: real figures of the product (catalog, history, timeframes…), counting up. */
async function ProofBar({ assets, years }: { assets: number; years: number }) {
  const { t, href } = await getI18n()
  const items = [
    {
      value: assets,
      label: t("criptomonedas con histórico", "cryptocurrencies with history"),
      link: { href: href("/assets"), text: t("Ver activos", "View assets") },
    },
    { value: years, label: t("años de velas reales de Binance", "years of real Binance candles") },
    { value: timeframes.length, label: t("temporalidades, de 1 minuto a 1 mes", "timeframes, from 1 minute to 1 month") },
    { value: candlePatterns.length, label: t("patrones de velas detectados", "candlestick patterns detected") },
    { value: maxBacktestCandles, label: t("velas por backtest", "candles per backtest") },
  ]
  return (
    <section aria-label={t("BacktestLab en cifras", "BacktestLab in figures")} className="border-b bg-muted/30">
      <dl className="container-page grid grid-cols-2 gap-x-6 gap-y-6 py-8 sm:grid-cols-3 lg:grid-cols-5 lg:py-10">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="order-2 text-caption text-muted-foreground">{item.label}</dt>
            <dd className="order-1 text-section font-bold tracking-tight">
              <CountUp value={item.value} />
            </dd>
            {item.link && (
              <Link
                href={item.link.href}
                className="order-3 inline-flex items-center gap-1 text-caption font-semibold text-primary hover:underline"
              >
                {item.link.text}
                <ArrowRightIcon className="size-3" />
              </Link>
            )}
          </div>
        ))}
      </dl>
    </section>
  )
}

export { ProofBar }
