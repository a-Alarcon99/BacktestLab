"use client"

import { CircleDollarSignIcon, PercentIcon, CoinsIcon, TrendingDownIcon, TrendingUpIcon, XIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import type { Locale, Translate } from "@/lib/i18n"
import { numberFormat } from "@/lib/format"
import { specOf } from "@/lib/strategy"
import type { GraphNode } from "@/lib/strategy-graph"
import { ruleKinds } from "../rule-kind"
import { nodeBox, type Layout } from "./builder-layout"

/** Tint of a node's icon chip. Buy/sell colours are reserved for the actions. */
const tones = {
  base: "bg-muted text-foreground",
  indicator: "bg-chart-3/15 text-chart-3",
  price: "bg-chart-5/15 text-chart-5",
  volume: "bg-chart-4/15 text-chart-4",
  pattern: "bg-chart-1/15 text-chart-1",
  periodic: "bg-muted text-muted-foreground",
  amount: "bg-primary/10 text-primary",
  buy: "bg-up-soft text-up",
  sell: "bg-down-soft text-down",
} as const

type NodeView = { kicker: string; title: string; subtitle: string; Icon: LucideIcon; tone: keyof typeof tones }

/** Texts, icon and tint of a node. */
function nodeView(node: GraphNode, locale: Locale, t: Translate): NodeView {
  switch (node.type) {
    case "price":
      return {
        kicker: t("Entrada", "Input"),
        title: t("Precio de cierre", "Close price"),
        subtitle: t("de cada vela", "of every candle"),
        Icon: CircleDollarSignIcon,
        tone: "base",
      }
    case "condition": {
      const spec = specOf(node.condition)
      return {
        kicker: ruleKinds[spec.family].label[locale],
        title: spec.name[locale],
        subtitle: spec.describe(node.condition, locale),
        Icon: ruleKinds[spec.family].Icon,
        tone: spec.family,
      }
    }
    case "and":
      return { kicker: "", title: t("Y", "AND"), subtitle: t("Todas se cumplen", "All must hold"), Icon: CoinsIcon, tone: "amount" }
    case "amount": {
      const value = Number.isNaN(node.size.value) ? "—" : numberFormat(locale, { maximumFractionDigits: 2 }).format(node.size.value)
      return node.size.unit === "pct"
        ? { kicker: t("Cantidad", "Amount"), title: t("Porcentaje", "Percentage"), subtitle: `${value} %`, Icon: PercentIcon, tone: "amount" }
        : { kicker: t("Cantidad", "Amount"), title: t("Importe fijo", "Fixed amount"), subtitle: `${value} USDT`, Icon: CoinsIcon, tone: "amount" }
    }
    case "action":
      return node.side === "buy"
        ? { kicker: t("Acción", "Action"), title: t("Compra", "Buy"), subtitle: t("Entrada", "Entry"), Icon: TrendingUpIcon, tone: "buy" }
        : { kicker: t("Acción", "Action"), title: t("Venta", "Sell"), subtitle: t("Salida", "Exit"), Icon: TrendingDownIcon, tone: "sell" }
  }
}

const port =
  "absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-border-strong bg-card shadow-xs transition-colors"

/**
 * A node of the canvas, positioned from its cell. Its right port starts a wire; it can be dragged to
 * another row of its column (and between the columns of its type), and clicked to edit it.
 */
function BuilderNode({
  node,
  layout,
  view,
  invalid,
  dashed,
  target,
  readOnly,
  onPress,
  onPortPress,
  onActivate,
  onRemove,
  removeLabel,
}: {
  node: GraphNode
  layout: Layout
  view: NodeView
  invalid?: boolean
  /** Not part of a complete rule (shown after a save attempt). */
  dashed?: boolean
  /** Highlighted as the place a wire being dragged would end. */
  target?: boolean
  readOnly?: boolean
  onPress?: (event: React.PointerEvent) => void
  onPortPress?: (event: React.PointerEvent) => void
  onActivate?: () => void
  onRemove?: () => void
  removeLabel?: string
}) {
  const box = nodeBox(node, layout)
  const { Icon } = view
  const hasIn = node.type !== "price"
  const hasOut = node.type !== "action"
  const isAnd = node.type === "and"
  const interactive = !readOnly

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${view.title}: ${view.subtitle}` : undefined}
      data-node={node.id}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onPointerDown={interactive ? onPress : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.target !== event.currentTarget) return
              if ((event.key === "Enter" || event.key === " ") && onActivate) {
                event.preventDefault()
                onActivate()
              } else if ((event.key === "Delete" || event.key === "Backspace") && onRemove) {
                event.preventDefault()
                onRemove()
              }
            }
          : undefined
      }
      className={cn(
        "group absolute flex items-center border bg-gradient-to-b from-card to-muted/40 shadow-sm transition-[left,top,width,border-color,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none outline-none select-none",
        isAnd ? "justify-center rounded-full px-2" : "gap-3 rounded-2xl px-3.5",
        interactive &&
          "cursor-grab hover:-translate-y-px hover:border-border-strong hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/30 active:cursor-grabbing",
        node.type === "action" && (node.side === "buy" ? "border-up/40" : "border-down/40"),
        dashed && "border-dashed border-down/60",
        invalid && "border-down",
        target && "border-primary ring-3 ring-primary/30"
      )}
    >
      {isAnd ? (
        <span className="text-body font-bold text-primary">{view.title}</span>
      ) : (
        <>
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-current/15 ring-inset",
              tones[view.tone]
            )}
          >
            <Icon className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[0.6875rem] leading-none font-semibold tracking-wide text-muted-foreground uppercase">
              {view.kicker}
            </span>
            <span className="truncate text-body leading-tight font-semibold">{view.title}</span>
            <span className="num line-clamp-2 text-caption leading-snug text-muted-foreground" title={view.subtitle}>
              {view.subtitle}
            </span>
          </span>
        </>
      )}

      {hasIn && <span aria-hidden className={cn(port, "-left-2", target && "border-primary")} />}
      {hasOut && (
        <span
          aria-hidden
          data-out-port={node.id}
          onPointerDown={interactive ? onPortPress : undefined}
          className={cn(port, "-right-2", interactive && "cursor-crosshair hover:border-primary hover:bg-primary/20")}
        >
          {/* Larger invisible target: the visible dot is small. */}
          {interactive && <span className="absolute -inset-2" />}
        </span>
      )}

      {interactive && onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          tabIndex={-1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover:opacity-100 hover:bg-down-soft hover:text-down focus-visible:opacity-100"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export { BuilderNode, nodeView }
export type { NodeView }
