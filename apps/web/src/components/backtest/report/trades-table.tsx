"use client"

import { useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ListIcon, LocateFixedIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import type { BacktestResult } from "@/lib/backtests"
import type { Rule } from "@/lib/strategy"
import { useReplayText } from "../replay/format"
import { useRuleLabel } from "../replay/trade-tooltip"
import { InfoHint, Reveal } from "./parts"

const PAGE = 50
type SortKey = "n" | "pnl" | "duration"

/**
 * Every trade of the run. Each row has two buttons: one marks the trade on the price chart, the
 * other opens its breakdown (every buy and sell).
 */
export function TradesTable({
  result,
  rules,
  intraday,
  selected,
  onSelect,
  onDetail,
}: {
  result: BacktestResult
  rules: Rule[]
  intraday: boolean
  selected: number | null
  onSelect: (trip: number) => void
  onDetail: (trip: number) => void
}) {
  const { t, f } = useReplayText()
  const label = useRuleLabel(rules)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "n", desc: false })
  const [shown, setShown] = useState(PAGE)
  const date = (iso: string) => (intraday ? f.tradeDateTime : f.date).format(new Date(iso))
  const rows = result.roundTrips.map((trip, k) => ({ trip, k }))
  const openCount = rows.filter(({ trip }) => trip.open).length
  const value = (row: (typeof rows)[number]) =>
    sort.key === "n" ? row.k : sort.key === "pnl" ? row.trip.pnlPct : row.trip.durationSeconds
  rows.sort((a, b) => (value(a) - value(b)) * (sort.desc ? -1 : 1))

  const header = (key: SortKey, text: string, className?: string) => {
    const active = sort.key === key
    return (
      <th scope="col" className={cn("px-3 py-2 font-semibold", className)} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "n" }))}
        >
          {text}
          {active && (sort.desc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
        </button>
      </th>
    )
  }

  return (
    <Reveal label={t("Operaciones", "Trades")} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-bold">
          {t("Todas las operaciones", "All trades")}
          <InfoHint title={t("Operaciones", "Trades")}>
            {t(
              "Cada fila va de la primera compra a la venta que cierra la posición y puede incluir varias compras y ventas parciales (columna «Compras / ventas»). Los precios son medios si hubo varias compras o ventas, sin comisiones; el resultado sí las descuenta. Con los botones de cada fila la marcas en el gráfico o abres el desglose de sus compras y ventas.",
              "Each row goes from the first buy to the sell that closes the position and can include several buys and partial sells (the “Buys / sells” column). Prices are averages when there were several buys or sells, without fees; the result does deduct them. With the buttons on each row you mark it on the chart or open the breakdown of its buys and sells."
            )}
          </InfoHint>
        </h3>
        <span className="num text-caption text-muted-foreground">
          {t(f.plural(rows.length, "operación", "operaciones"), f.plural(rows.length, "trade", "trades"))}
          {openCount > 0 && (
            <span className="ml-1.5 font-semibold text-primary">
              {t(`· ${f.count.format(openCount)} sin salida todavía`, `· ${f.count.format(openCount)} not exited yet`)}
            </span>
          )}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-caption text-muted-foreground">{t("No hubo operaciones.", "There were no trades.")}</p>
      ) : (
        <div className="bt-fade -mx-4 overflow-x-auto">
          <table className="num w-full min-w-[50rem] text-left text-caption">
            <thead className="border-y bg-muted/40 text-muted-foreground">
              <tr>
                {header("n", "#", "w-12")}
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("Entrada", "Entry")}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("Salida", "Exit")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {t("Compras / ventas", "Buys / sells")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {t("Precio entrada → salida", "Entry → exit price")}
                </th>
                {header("pnl", t("Resultado", "Result"), "text-right")}
                {header("duration", t("Duración", "Duration"), "text-right")}
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("Cerrada por", "Closed by")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" data-print-hide>
                  <span className="sr-only">{t("Acciones", "Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map(({ trip, k }) => (
                <tr
                  key={k}
                  className={cn("border-b transition-colors last:border-0 hover:bg-muted/50", trip.open && "bg-primary/5", selected === k && "bg-accent/60")}
                >
                  <td className="px-3 py-2 text-muted-foreground">{k + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{date(trip.entryTime)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {trip.exitTime ? date(trip.exitTime) : <span className="font-semibold text-primary">{t("Sin salida", "No exit yet")}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {trip.buys} / {trip.sells}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {f.price(trip.entryPrice)} → {f.price(trip.exitPrice)}
                    {trip.open && <span className="ml-1 font-normal text-muted-foreground">{t("(último cierre)", "(last close)")}</span>}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-semibold whitespace-nowrap", trip.pnl >= 0 ? "text-up" : "text-down")}>
                    {f.signedPct(trip.pnlPct, 2)}
                    <span className="ml-1.5 font-normal text-muted-foreground">{f.usdt(trip.pnl, true)}</span>
                    {trip.open && <span className="ml-1.5 font-normal text-muted-foreground">{t("sin cerrar", "unrealized")}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{f.duration(trip.durationSeconds)}</td>
                  <td className="max-w-48 truncate px-3 py-2 text-muted-foreground">{trip.open ? t("Sigue abierta", "Still open") : label(trip.exitRuleId)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap" data-print-hide>
                    <Button
                      type="button"
                      variant={selected === k ? "secondary" : "ghost"}
                      size="icon-sm"
                      aria-label={t(`Marcar la operación ${k + 1} en el gráfico`, `Mark trade ${k + 1} on the chart`)}
                      title={t("Marcar en el gráfico", "Mark on the chart")}
                      aria-pressed={selected === k}
                      onClick={() => onSelect(k)}
                    >
                      <LocateFixedIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(`Ver el desglose de la operación ${k + 1}`, `See the breakdown of trade ${k + 1}`)}
                      title={t("Ver compras y ventas", "See buys and sells")}
                      onClick={() => onDetail(k)}
                    >
                      <ListIcon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown && (
        <Button variant="outline" size="sm" className="self-center" onClick={() => setShown((s) => s + PAGE * 4)} data-print-hide>
          <ChevronDownIcon data-icon="inline-start" />
          {t(`Ver más (${f.count.format(rows.length - shown)} restantes)`, `Show more (${f.count.format(rows.length - shown)} left)`)}
        </Button>
      )}
    </Reveal>
  )
}

/** Technical ratios for those who look for them, folded by default. */
export function AdvancedMetrics({ result }: { result: BacktestResult }) {
  const { t, f } = useReplayText()
  const m = result.metrics
  const items = [
    {
      label: t("Rentabilidad anualizada", "Annualized return"),
      value: m.cagrPct !== null ? f.signedPct(m.cagrPct) : "—",
      text:
        m.cagrPct !== null
          ? t("Lo que habría rendido al año a este ritmo, con interés compuesto.", "What it would yield per year at this pace, compounded.")
          : t("El periodo es demasiado corto (menos de 30 días) para anualizarlo.", "The period is too short (under 30 days) to annualize."),
    },
    {
      label: "Sharpe",
      value: m.sharpe !== null ? f.ratio.format(m.sharpe) : "—",
      text: t(
        "Rentabilidad por unidad de riesgo (anualizada, sin tipo libre de riesgo). Por encima de 1 es bueno; por encima de 2, muy bueno.",
        "Return per unit of risk (annualized, no risk-free rate). Above 1 is good; above 2, very good."
      ),
    },
    {
      label: "Sortino",
      value: m.sortino !== null ? f.ratio.format(m.sortino) : "—",
      text: t(
        "Como el Sharpe, pero solo penaliza los movimientos a la baja. Más alto es mejor.",
        "Like Sharpe, but only penalizes downward moves. Higher is better."
      ),
    },
    {
      label: "Calmar",
      value: m.calmar !== null ? f.ratio.format(m.calmar) : "—",
      text: t(
        "Rentabilidad anualizada dividida entre la caída máxima. Mide cuánto se gana por cada punto de caída sufrida.",
        "Annualized return divided by the max drawdown. How much is gained per point of fall endured."
      ),
    },
    {
      label: t("Volatilidad anualizada", "Annualized volatility"),
      value: m.volatilityPct !== null ? f.pct(m.volatilityPct) : "—",
      text: t("Cuánto oscila el capital de una vela a otra, llevado a un año.", "How much the capital swings candle to candle, scaled to a year."),
    },
  ]
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden">
        {t("Avanzado: ratios técnicos", "Advanced: technical ratios")}
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <dl className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <dt className="text-caption font-semibold text-muted-foreground">{item.label}</dt>
            <dd className="num text-title font-bold">{item.value}</dd>
            <dd className="text-caption text-muted-foreground">{item.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
