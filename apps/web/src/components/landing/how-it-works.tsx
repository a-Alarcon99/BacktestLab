import { CoinsIcon, PlayIcon, WorkflowIcon } from "lucide-react"
import { getI18n } from "@/lib/i18n-server"
import { BuilderArt } from "./art/builder-art"
import { SectionHeading } from "./section-heading"

/** Section 3: three steps, and the visual editor at work (the step that scares beginners). */
async function HowItWorks() {
  const { t } = await getI18n()
  const steps = [
    {
      Icon: CoinsIcon,
      title: t("Elige activo y periodo", "Pick an asset and a period"),
      text: t(
        "Cualquier criptomoneda del catálogo, el rango de fechas que quieras y 11 temporalidades.",
        "Any cryptocurrency in the catalog, the date range you want and 11 timeframes."
      ),
    },
    {
      Icon: WorkflowIcon,
      title: t("Dibuja tus reglas", "Draw your rules"),
      text: t(
        "Arrastra condiciones (RSI, medias, Bollinger, patrones de velas…) y conéctalas a una compra o una venta.",
        "Drag in conditions (RSI, moving averages, Bollinger, candlestick patterns…) and wire them to a buy or a sell."
      ),
    },
    {
      Icon: PlayIcon,
      title: t("Mira el resultado", "Watch the result"),
      text: t(
        "El backtest se reproduce vela a vela con cada orden, comisiones incluidas, y te da las métricas clave.",
        "The backtest replays candle by candle with every order, fees included, and gives you the key metrics."
      ),
    },
  ]
  return (
    <section aria-labelledby="how-title" className="container-page flex flex-col gap-10 py-16 lg:py-24">
      <SectionHeading
        id="how-title"
        kicker={t("Cómo funciona", "How it works")}
        title={t("De una idea a un backtest en tres pasos", "From an idea to a backtest in three steps")}
        lead={t(
          "Si sabes explicar tu estrategia con palabras, sabes construirla aquí. No hay código ni fórmulas que escribir.",
          "If you can explain your strategy in words, you can build it here. There's no code or formulas to write."
        )}
      />
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map(({ Icon, title, text }, i) => (
          <li key={title} className="relative flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <span className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <span className="num text-caption font-bold text-muted-foreground">0{i + 1}</span>
            </span>
            <h3 className="text-title font-bold">{title}</h3>
            <p className="text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
      <div className="rounded-3xl border bg-muted/30 p-4 sm:p-6 lg:p-8">
        <BuilderArt />
      </div>
    </section>
  )
}

export { HowItWorks }
