import { CheckIcon } from "lucide-react"
import { getI18n } from "@/lib/i18n-server"
import { LayersArt } from "./art/layers-art"
import { SectionHeading } from "./section-heading"

/** Section 4: depth. Every trade feeds the metrics, and every metric is explained. */
async function AnalysisSection() {
  const { t } = await getI18n()
  const points = [
    t("Rentabilidad y curva de capital", "Return and equity curve"),
    "Win rate",
    t("Drawdown máximo", "Max drawdown"),
    t("Ratio de Sharpe", "Sharpe ratio"),
    t("Comisiones incluidas", "Fees included"),
    t("Replay vela a vela", "Candle-by-candle replay"),
  ]
  return (
    <section aria-labelledby="analysis-title" className="border-y bg-muted/30">
      <div className="container-page flex flex-col gap-10 py-16 lg:py-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="analysis-title"
            kicker={t("Análisis", "Analysis")}
            title={t("Cada operación se convierte en métricas que entiendes", "Every trade turns into metrics you understand")}
            lead={t(
              "El motor simula cada orden sobre velas reales y separa el resultado en capas: operaciones, resultado de cada una, capital y caídas. Recórrelas en el tiempo y cada cifra te explica qué significa.",
              "The engine simulates every order over real candles and splits the result into layers: trades, each trade's result, equity and drawdowns. Travel through them in time and every figure explains itself."
            )}
          />
          <ul className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-caption font-semibold lg:mb-1">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-primary" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <LayersArt />
      </div>
    </section>
  )
}

export { AnalysisSection }
