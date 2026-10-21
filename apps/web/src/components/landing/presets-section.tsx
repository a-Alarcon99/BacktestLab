import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getI18n } from "@/lib/i18n-server"
import { snapshot } from "@/lib/landing/snapshot"
import { presetInfo } from "@/lib/preset-strategies"
import { cn } from "@/lib/utils"
import { EquityLine } from "./art/equity-line"
import { monthRange, num, pct } from "./format"
import { SectionHeading } from "./section-heading"

/** Section 5: the three built-in strategies with their real results, as a way to start. */
async function PresetsSection() {
  const { locale, t, href } = await getI18n()
  return (
    <section aria-labelledby="presets-title" className="container-page flex flex-col gap-10 py-16 lg:py-24">
      <SectionHeading
        id="presets-title"
        kicker={t("Estrategias listas", "Ready-made strategies")}
        title={t("No tienes que empezar de cero", "You don't have to start from scratch")}
        lead={t(
          "Tres estrategias clásicas, explicadas paso a paso, para probarlas tal cual o usarlas de base para las tuyas.",
          "Three classic strategies, explained step by step, to try as they are or to build your own on."
        )}
      />
      <ul className="grid gap-4 lg:grid-cols-3">
        {Object.entries(presetInfo).map(([id, info]) => {
          const result = snapshot.presets[id]
          if (!result) return null
          const figures = [
            { label: t("Rentabilidad", "Return"), value: pct(locale, result.returnPct), tone: result.returnPct >= 0 ? "up" : "down" },
            { label: t("Drawdown máx.", "Max drawdown"), value: pct(locale, -result.maxDrawdownPct), tone: "down" },
            { label: "Win rate", value: pct(locale, result.winRatePct, { signed: false, digits: 0 }) },
            { label: t("Operaciones", "Trades"), value: num(locale, result.roundTrips) },
          ]
          return (
            <li key={id}>
              <Link
                href={href(`/strategies/${id}`)}
                className="group flex h-full flex-col gap-5 rounded-2xl border bg-card p-5 transition-[border-color,box-shadow,transform] outline-none hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <div className="flex flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{info.horizonLabel[locale]}</Badge>
                    <Badge variant="outline">{result.timeframe}</Badge>
                    <span className="text-caption text-muted-foreground">{info.holding[locale]}</span>
                  </span>
                  <h3 className="text-title font-bold">{info.name[locale]}</h3>
                  <p className="text-muted-foreground">{info.summary[locale]}</p>
                </div>
                <EquityLine
                  curve={result.curve}
                  label={t(
                    `Curva de capital: ${pct(locale, result.returnPct)} en ${snapshot.symbol}`,
                    `Equity curve: ${pct(locale, result.returnPct)} on ${snapshot.symbol}`
                  )}
                />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4">
                  {figures.map((f) => (
                    <div key={f.label} className="flex flex-col gap-0.5">
                      <dt className="text-caption text-muted-foreground">{f.label}</dt>
                      <dd className={cn("num font-bold", f.tone === "up" && "text-up", f.tone === "down" && "text-down")}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-auto flex items-center justify-between gap-3 text-caption">
                  <span className="text-muted-foreground">
                    {snapshot.symbol} · {monthRange(locale, result.from, result.to)} ·{" "}
                    {t("comprar y mantener", "buy & hold")} <span className="num font-semibold text-foreground">{pct(locale, result.buyHoldPct)}</span>
                  </span>
                  <ArrowRightIcon className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="max-w-3xl text-caption text-muted-foreground">
        {t(
          `Resultados reales de ${snapshot.symbol}/USDT con la temporalidad y el rango recomendados de cada estrategia y una comisión del ${pct(locale, snapshot.feePct, { signed: false, digits: 1 })} por orden. Rentabilidades pasadas no garantizan resultados futuros: compáralas siempre con comprar y mantener.`,
          `Real ${snapshot.symbol}/USDT results with each strategy's recommended timeframe and range and a ${pct(locale, snapshot.feePct, { signed: false, digits: 1 })} fee per order. Past returns don't guarantee future results: always compare them with buy & hold.`
        )}
      </p>
    </section>
  )
}

export { PresetsSection }
