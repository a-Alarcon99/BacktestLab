import { ActivityIcon, CandlestickChartIcon, FilterIcon, GitMergeIcon, PercentIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { getI18n } from "@/lib/i18n-server"
import { ConflictArt } from "./art/conflict-art"
import { IndicatorsArt } from "./art/indicators-art"
import { PatternArt } from "./art/pattern-art"
import { SectionHeading } from "./section-heading"

/** Section 6: for the technical profile, what the engine can express. */
async function Capabilities() {
  const { t } = await getI18n()
  const cells: { Icon: LucideIcon; title: string; text: string; chips?: string[]; art?: React.ReactNode }[] = [
    {
      Icon: CandlestickChartIcon,
      title: t("Patrones de velas", "Candlestick patterns"),
      text: t(
        "Martillo, envolventes, estrellas, soldados… detectados al cierre de la vela que los completa, sin mirar al futuro.",
        "Hammer, engulfing, stars, soldiers… detected at the close of the candle that completes them, without looking ahead."
      ),
      art: <PatternArt />,
    },
    {
      Icon: ActivityIcon,
      title: t("Indicadores técnicos", "Technical indicators"),
      text: t("Los clásicos, con sus parámetros a tu medida.", "The classics, with the settings you choose."),
      art: <IndicatorsArt />,
      chips: ["RSI", "MACD", "SMA / EMA", "Bollinger", "Donchian", t("Volumen", "Volume"), t("Variación de precio", "Price change")],
    },
    {
      Icon: ShieldCheckIcon,
      title: t("Te avisa de los errores", "It catches mistakes"),
      text: t(
        "Si una regla nunca podría cumplirse, lo sabrás antes de gastar un backtest.",
        "If a rule could never be met, you'll know before spending a backtest."
      ),
      art: <ConflictArt />,
    },
    {
      Icon: GitMergeIcon,
      title: t("Combina con Y / O", "Combine with AND / OR"),
      text: t(
        "Hasta tres condiciones por regla y varias reglas de compra y de venta por estrategia.",
        "Up to three conditions per rule and several buy and sell rules per strategy."
      ),
      chips: [t("RSI < 30 Y banda inferior", "RSI < 30 AND lower band"), t("Cruce EMA O ruptura", "EMA cross OR breakout")],
    },
    {
      Icon: FilterIcon,
      title: t("Filtros de tendencia y duración", "Trend and duration filters"),
      text: t(
        "Cada condición puede exigir mercado alcista o bajista y mantener la señal activa varias velas.",
        "Each condition can require an up or down market and keep its signal active for several candles."
      ),
      chips: [t("Solo si cierre > EMA 50", "Only if close > EMA 50"), t("Señal activa 3 velas", "Signal active 3 candles")],
    },
    {
      Icon: PercentIcon,
      title: t("Órdenes y comisiones realistas", "Realistic orders and fees"),
      text: t(
        "Capital inicial, comisión por orden, compras por porcentaje o importe fijo, stops desde el precio de compra.",
        "Starting capital, fee per order, buys by percentage or fixed amount, stops from the buy price."
      ),
      chips: [t("Comisión 0,1 %", "0.1% fee"), t("Stop −4 % desde la compra", "−4% stop from the buy")],
    },
  ]
  return (
    <section aria-labelledby="capabilities-title" className="border-t bg-muted/30">
      <div className="container-page flex flex-col gap-10 py-16 lg:py-24">
        <SectionHeading
          id="capabilities-title"
          kicker={t("Potente por dentro", "Powerful inside")}
          title={t("Sencillo de usar, sin quedarse corto", "Simple to use, without falling short")}
          lead={t(
            "Debajo de los bloques hay un motor que entiende las mismas ideas que usarías en una hoja de cálculo o en código.",
            "Under the blocks there's an engine that understands the same ideas you'd use in a spreadsheet or in code."
          )}
        />
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cells.map(({ Icon, title, text, chips, art }) => (
            <li key={title} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
              <span className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" />
                </span>
                <h3 className="font-bold">{title}</h3>
              </span>
              <p className="text-muted-foreground">{text}</p>
              {art && <div className={cn("rounded-xl border bg-muted/30 p-3", !chips && "mt-auto")}>{art}</div>}
              {chips && (
                <ul className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {chips.map((chip) => (
                    <li key={chip} className="num rounded-md border bg-muted/40 px-2 py-1 text-caption font-semibold">
                      {chip}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export { Capabilities }
