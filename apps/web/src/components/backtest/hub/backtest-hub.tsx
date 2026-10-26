import Link from "next/link"
import { ArrowRightIcon, DicesIcon, HistoryIcon, LayersIcon, LineChartIcon } from "lucide-react"
import { getI18n } from "@/lib/i18n-server"
import { testMeta } from "../robust/test-meta"

/**
 * Entry point to every kind of backtest: a grid of cards, each opening its own page (one asset,
 * several assets, the three robustness tests and the history).
 */
async function BacktestHub() {
  const { t, href } = await getI18n()
  const cards = [
    {
      path: "/backtests/asset",
      icon: <LineChartIcon />,
      title: t("Un activo", "One asset"),
      text: t("Una estrategia sobre un activo, con la animación y el informe completo.", "One strategy on one asset, with the animation and the full report."),
    },
    {
      path: "/backtests/assets",
      icon: <LayersIcon />,
      title: t("Varios activos", "Several assets"),
      text: t("La misma estrategia en varios activos a la vez: ¿funciona en todos o solo en uno?", "The same strategy on several assets at once: does it work on all of them or just one?"),
    },
    { path: "/backtests/windows", ...testMeta("windows", t) },
    { path: "/backtests/sensitivity", ...testMeta("sensitivity", t) },
    { path: "/backtests/timeframes", ...testMeta("timeframes", t) },
    {
      path: "/backtests/montecarlo",
      icon: <DicesIcon />,
      title: "Monte Carlo",
      text: t(
        "Miles de historias alternativas de tu estrategia: ¿ventaja real o azar? Con tus operaciones o con mercados sintéticos.",
        "Thousands of alternative histories of your strategy: a real edge or chance? With your own trades or synthetic markets."
      ),
    },
    {
      path: "/backtests/history",
      icon: <HistoryIcon />,
      title: t("Historial", "History"),
      text: t("Tus ejecuciones recientes, guardadas en este navegador.", "Your recent runs, saved in this browser."),
    },
  ]

  return (
    <nav aria-label={t("Tipo de backtest", "Backtest type")}>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <li key={card.path} className="flex">
            <Link
              href={href(card.path)}
              className="group flex w-full flex-col gap-3 rounded-xl border bg-card p-5 outline-none transition-[border-color,box-shadow,background-color] hover:border-primary hover:bg-muted/30 hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground [&_svg]:size-5">{card.icon}</span>
                <span className="text-title font-bold">{card.title}</span>
                <ArrowRightIcon aria-hidden className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
              </span>
              <span className="text-muted-foreground">{card.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export { BacktestHub }
