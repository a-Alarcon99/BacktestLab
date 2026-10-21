import { CircleDollarSignIcon, TrendingDownIcon, TrendingUpIcon, XIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import type { Locale, Translate } from "@/lib/i18n"
import { numberFormat } from "@/lib/format"
import { specOf } from "@/lib/strategy"
import type { GraphNode } from "@/lib/strategy-graph"
import { ruleKinds } from "../rule-kind"
import { nodeBox, type Layout } from "./builder-layout"

/** Colour of each kind of node, so they tell apart at a glance: the node itself and its icon chip. */
export const nodeStyles = {
  price: { box: "border-border-strong from-card to-muted/60", chip: "bg-muted text-foreground" },
  condition: { box: "border-primary/50 from-primary/10 to-card", chip: "bg-primary/15 text-primary" },
  buy: { box: "border-up/50 from-up-soft to-card", chip: "bg-up/15 text-up" },
  sell: { box: "border-down/50 from-down-soft to-card", chip: "bg-down/15 text-down" },
} as const

type NodeView = { kicker: string; title: string; subtitle: string; Icon: LucideIcon; style: keyof typeof nodeStyles }

/** Texts, icon and colour of a node. */
function nodeView(node: GraphNode, locale: Locale, t: Translate): NodeView {
  switch (node.type) {
    case "price":
      return {
        kicker: t("Entrada", "Input"),
        title: t("Precio de cierre", "Close price"),
        subtitle: t("de cada vela", "of every candle"),
        Icon: CircleDollarSignIcon,
        style: "price",
      }
    case "condition": {
      const spec = specOf(node.condition)
      return {
        kicker: ruleKinds[spec.family].label[locale],
        title: spec.name[locale],
        subtitle: spec.describe(node.condition, locale),
        Icon: ruleKinds[spec.family].Icon,
        style: "condition",
      }
    }
    case "action": {
      const value = Number.isNaN(node.size.value) ? "—" : numberFormat(locale, { maximumFractionDigits: 2 }).format(node.size.value)
      const amount =
        node.side === "sell"
          ? t(`${value} % de la posición`, `${value}% of the position`)
          : node.size.unit === "usdt"
            ? `${value} USDT`
            : t(`${value} % del efectivo`, `${value}% of the cash`)
      return node.side === "buy"
        ? { kicker: t("Acción", "Action"), title: t("Compra", "Buy"), subtitle: amount, Icon: TrendingUpIcon, style: "buy" }
        : { kicker: t("Acción", "Action"), title: t("Venta", "Sell"), subtitle: amount, Icon: TrendingDownIcon, style: "sell" }
    }
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
  inputs = 0,
  onPress,
  onPortPress,
  onActivate,
  onToggleMode,
  onRemove,
  removeLabel,
  modeLabel,
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
  /** Wires coming into the node: from two on, the AND/OR switch shows where they meet. */
  inputs?: number
  onPress?: (event: React.PointerEvent) => void
  onPortPress?: (event: React.PointerEvent) => void
  onActivate?: () => void
  onToggleMode?: () => void
  onRemove?: () => void
  removeLabel?: string
  /** Texts of the AND/OR switch: its label, its two values and what it does. */
  modeLabel?: { and: string; or: string; title: string }
}) {
  const box = nodeBox(node, layout)
  const { Icon } = view
  const hasIn = node.type !== "price"
  const hasOut = node.type !== "action"
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
        "group absolute flex items-center gap-3 rounded-2xl border bg-gradient-to-b px-3.5 shadow-sm transition-[left,top,width,border-color,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none outline-none select-none",
        nodeStyles[view.style].box,
        interactive &&
          "cursor-grab hover:-translate-y-px hover:border-border-strong hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/30 active:cursor-grabbing",
        dashed && "border-dashed border-down/60",
        invalid && "border-down",
        target && "border-primary ring-3 ring-primary/30"
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-current/15 ring-inset",
          nodeStyles[view.style].chip
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

      {hasIn && inputs >= 2 && modeLabel ? (
        <button
          type="button"
          title={modeLabel.title}
          aria-label={`${modeLabel.title}: ${node.mode === "or" ? modeLabel.or : modeLabel.and}`}
          disabled={!interactive}
          tabIndex={interactive ? 0 : -1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onToggleMode?.()
          }}
          className={cn(
            "absolute top-1/2 -left-5 flex h-6 min-w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card px-1.5 text-[0.6875rem] font-bold shadow-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
            node.mode === "or" ? "border-chart-4 text-chart-4" : "border-primary text-primary",
            interactive && "cursor-pointer hover:bg-accent",
            target && "ring-3 ring-primary/30"
          )}
        >
          {node.mode === "or" ? modeLabel.or : modeLabel.and}
        </button>
      ) : (
        hasIn && <span aria-hidden className={cn(port, "-left-2", target && "border-primary")} />
      )}
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
