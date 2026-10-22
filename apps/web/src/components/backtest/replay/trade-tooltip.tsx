"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { cn } from "cn"
import type { BacktestTrade, RoundTrip } from "@/lib/backtests"
import { describeConditions, describeSize, ruleName, type Rule } from "@/lib/strategy"
import { useReplayText } from "./format"

/** "Regla de venta 2 · 100 % de la posición" for a rule id (or "Regla eliminada"). */
export function useRuleLabel(rules: Rule[]) {
  const { locale, t } = useReplayText()
  return (id: string | null) => {
    if (id === null) return t("Sigue abierta", "Still open")
    const rule = rules.find((r) => r.id === id || id.startsWith(`${r.id}~`))
    if (!rule) return t("Regla eliminada", "Deleted rule")
    const position = rules.filter((r) => r.side === rule.side).indexOf(rule) + 1
    const name = ruleName(rule.side, position, locale)
    return `${name[0].toUpperCase()}${name.slice(1)}`
  }
}

/**
 * Card next to a hovered order: what fired it (rule and conditions), when the signal came and
 * when it filled, and the trade's result for a closing sell. Measured after render so it always
 * stays inside its positioned parent: above the point when it fits, below otherwise.
 */
export function TradeTooltip({
  trade,
  trip,
  rules,
  intraday,
  x,
  y,
}: {
  trade: BacktestTrade
  trip: RoundTrip | undefined
  rules: Rule[]
  intraday: boolean
  x: number
  y: number
}) {
  const { locale, t, f } = useReplayText()
  const buy = trade.side === "buy"
  const rule = rules.find((r) => r.id === trade.ruleId || trade.ruleId.startsWith(`${r.id}~`))
  const label = useRuleLabel(rules)
  const date = (iso: string) => (intraday ? `${f.tradeDateTime.format(new Date(iso))} UTC` : f.date.format(new Date(iso)))
  const closes = !buy && trip && !trip.open && trip.exitTime === trade.time
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent
    if (!el || !parent) return
    const margin = 8
    const gap = 14
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.min(Math.max(margin, x - w / 2), Math.max(margin, parent.clientWidth - w - margin))
    let top = y - gap - h >= margin ? y - gap - h : y + gap
    if (top + h > parent.clientHeight - margin) top = Math.max(margin, parent.clientHeight - h - margin)
    setPos({ left, top })
  }, [x, y, trade])
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-20 w-68 max-w-[calc(100%-1rem)] rounded-lg border bg-popover p-3 text-caption text-popover-foreground shadow-lg"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      <p className={cn("mb-1.5 flex items-center justify-between gap-2 font-bold", buy ? "text-up" : "text-down")}>
        <span>{buy ? t("▲ Compra", "▲ Buy") : t("▼ Venta", "▼ Sell")}</span>
        {closes && (
          <span className={cn("num rounded-full px-2 py-0.5", trip.pnl > 0 ? "bg-up-soft text-up" : "bg-down-soft text-down")}>
            {f.signedPct(trip.pnlPct)}
          </span>
        )}
      </p>
      <dl className="num flex flex-col gap-1">
        <Row label={t("Precio de ejecución", "Fill price")} value={f.price(trade.price)} />
        <Row label={buy ? t("Importe", "Amount") : t("Cobrado", "Received")} value={f.usdt(trade.amount)} />
        {closes && <Row label={t("Resultado de la operación", "Trade result")} value={f.usdt(trip.pnl, true)} />}
        <Row
          label={t("Cuándo", "When")}
          value={t(
            `Señal al cierre del ${date(trade.signalTime)}; ejecutada a la apertura siguiente`,
            `Signal at the close of ${date(trade.signalTime)}; filled at the next open`
          )}
        />
        <Row label={t("Regla", "Rule")} value={rule ? `${label(trade.ruleId)} · ${describeSize(rule, locale)}` : label(trade.ruleId)} />
        {rule && <Row label={t("Condición", "Condition")} value={describeConditions(rule, locale)} />}
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}
