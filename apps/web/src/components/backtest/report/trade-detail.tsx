"use client"

import { useState } from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { tripOrders } from "@/lib/backtest-report"
import type { BacktestResult } from "@/lib/backtests"
import { describeConditions, describeSize, type Rule } from "@/lib/strategy"
import { useReplayText } from "../replay/format"
import { findRule, useRuleLabel } from "../replay/trade-tooltip"

/**
 * Read-only breakdown of one trade (`k`, index in `roundTrips`): each of its buys and sells with
 * when it filled, at what price, for how much and which rule and conditions fired it. Opens over
 * the report; `k = null` closes it (the last trade stays rendered while it fades out).
 */
export function TradeDetailDialog({
  k,
  result,
  rules,
  intraday,
  onClose,
}: {
  k: number | null
  result: BacktestResult
  rules: Rule[]
  intraday: boolean
  onClose: () => void
}) {
  const [shown, setShown] = useState(k)
  if (k !== null && k !== shown) setShown(k)
  return (
    <Dialog open={k !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(60rem,calc(100vw-1.5rem))]">
        {shown !== null && result.roundTrips[shown] && <Breakdown k={shown} result={result} rules={rules} intraday={intraday} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Breakdown({ k, result, rules, intraday, onClose }: { k: number; result: BacktestResult; rules: Rule[]; intraday: boolean; onClose: () => void }) {
  const { locale, t, f } = useReplayText()
  const label = useRuleLabel(rules)
  const trip = result.roundTrips[k]
  const orders = tripOrders(result, k)
  const date = (iso: string) => (intraday ? `${f.tradeDateTime.format(new Date(iso))} UTC` : f.date.format(new Date(iso)))
  const tone = trip.pnl >= 0 ? "text-up" : "text-down"

  return (
    <>
      <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DialogTitle className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-title font-bold">
            {t(`Operación ${k + 1}`, `Trade ${k + 1}`)}
            <span className={cn("num rounded-full px-2 py-0.5 text-caption", trip.pnl >= 0 ? "bg-up-soft text-up" : "bg-down-soft text-down")}>
              {f.signedPct(trip.pnlPct, 2)}
              {trip.open && ` · ${t("sin cerrar", "unrealized")}`}
            </span>
          </DialogTitle>
          <DialogDescription className="num text-caption text-muted-foreground">
            {date(trip.entryTime)} → {trip.exitTime ? date(trip.exitTime) : t("sin salida todavía", "no exit yet")} · {f.duration(trip.durationSeconds)} ·{" "}
            {t(
              `${f.plural(trip.buys, "compra", "compras")} y ${f.plural(trip.sells, "venta", "ventas")}`,
              `${f.plural(trip.buys, "buy", "buys")} and ${f.plural(trip.sells, "sell", "sells")}`
            )}
          </DialogDescription>
        </div>
        <DialogClose />
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="num w-full min-w-[44rem] text-left text-caption">
          <thead className="sticky top-0 border-b bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 font-semibold">
                #
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("Tipo", "Type")}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("Día y hora", "Date and time")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {t("Precio de ejecución", "Fill price")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {t("Importe", "Amount")}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("Condiciones que la activan", "Conditions that fired it")}
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, n) => {
              const buy = order.side === "buy"
              const rule = findRule(rules, order.ruleId)
              return (
                <tr key={n} className="border-b align-top last:border-0">
                  <td className="px-3 py-2.5 text-muted-foreground">{n + 1}</td>
                  <td className={cn("px-3 py-2.5 font-semibold whitespace-nowrap", buy ? "text-up" : "text-down")}>
                    {buy ? t("▲ Compra", "▲ Buy") : t("▼ Venta", "▼ Sell")}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {date(order.time)}
                    <span className="block text-muted-foreground">{t(`Señal: ${date(order.signalTime)}`, `Signal: ${date(order.signalTime)}`)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{f.price(order.price)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {f.usdt(order.amount)}
                    <span className="block text-muted-foreground">{buy ? t("gastado", "spent") : t("cobrado", "received")}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{label(order.ruleId)}</span>
                    {rule ? (
                      <>
                        <span className="text-muted-foreground"> · {describeSize(rule, locale)}</span>
                        <span className="block text-muted-foreground">{describeConditions(rule, locale)}</span>
                      </>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 md:px-5">
        <p className="num text-caption text-muted-foreground">
          {t("Resultado de la operación", "Trade result")}:{" "}
          <span className={cn("font-semibold", tone)}>
            {f.usdt(trip.pnl, true)} ({f.signedPct(trip.pnlPct, 2)})
          </span>{" "}
          {trip.open
            ? t("· la posición sigue abierta: valorada al último cierre.", "· the position is still open: valued at the last close.")
            : t("· con comisiones.", "· after fees.")}
        </p>
        <Button variant="outline" onClick={onClose}>
          {t("Cerrar", "Close")}
        </Button>
      </footer>
    </>
  )
}
