"use client"

import { ChevronDownIcon, CoinsIcon, PercentIcon, TrendingDownIcon, TrendingUpIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { conditionKinds, conditionSpecs, type RuleKind } from "@/lib/strategy"
import type { NodeData } from "@/lib/strategy-graph"
import { ruleKinds } from "../rule-kind"
import type { PressHandler } from "./builder-types"

type Item = { key: string; label: string; Icon: LucideIcon; data: NodeData; className?: string }
type Section = { key: string; title: string; items: Item[] }

/** Sections of the menu: one drop-down per kind of component, in the order of the columns. */
function useSections(): Section[] {
  const { locale, t } = useI18n()
  const conditions = (family: RuleKind): Item[] =>
    conditionKinds
      .filter((kind) => conditionSpecs[kind].family === family)
      .map((kind) => ({
        key: kind,
        label: conditionSpecs[kind].name[locale],
        Icon: ruleKinds[family].Icon,
        data: { type: "condition", condition: conditionSpecs[kind].defaults("buy") },
      }))
  return [
    { key: "indicator", title: t("Indicadores", "Indicators"), items: conditions("indicator") },
    { key: "pattern", title: t("Patrones de velas", "Candlestick patterns"), items: conditions("pattern") },
    { key: "volume", title: t("Volumen", "Volume"), items: conditions("volume") },
    { key: "price", title: t("Precio", "Price"), items: conditions("price") },
    { key: "periodic", title: t("Periódica", "Periodic"), items: conditions("periodic") },
    {
      key: "logic",
      title: t("Condiciones lógicas", "Logic conditions"),
      items: [{ key: "and", label: t("Y (todas a la vez)", "AND (all at once)"), Icon: ChevronDownIcon, data: { type: "and" } }],
    },
    {
      key: "amount",
      title: t("Cantidad a ejecutar", "Amount to execute"),
      items: [
        { key: "pct", label: t("Porcentaje (%)", "Percentage (%)"), Icon: PercentIcon, data: { type: "amount", size: { unit: "pct", value: 100 } } },
        { key: "usdt", label: t("Importe fijo (USDT)", "Fixed amount (USDT)"), Icon: CoinsIcon, data: { type: "amount", size: { unit: "usdt", value: 100 } } },
      ],
    },
    {
      key: "action",
      title: t("Acciones", "Actions"),
      items: [
        { key: "buy", label: t("Compra", "Buy"), Icon: TrendingUpIcon, data: { type: "action", side: "buy" }, className: "text-up" },
        { key: "sell", label: t("Venta", "Sell"), Icon: TrendingDownIcon, data: { type: "action", side: "sell" }, className: "text-down" },
      ],
    },
  ]
}

/**
 * Left menu with every component grouped in drop-downs. Drag an entry onto the panel (it lands in
 * its own column); a click or Enter adds it at the top of that column.
 */
function BuilderMenu({ press, onAdd }: { press: PressHandler; onAdd: (data: NodeData) => void }) {
  const { t } = useI18n()
  const sections = useSections()
  return (
    <Card className="lg:sticky lg:top-[calc(var(--spacing-header)+1rem)] lg:max-h-[calc(100dvh-var(--spacing-header)-2rem)] lg:overflow-y-auto">
      <CardHeader>
        <CardTitle>{t("Componentes", "Components")}</CardTitle>
      </CardHeader>
      <div className="flex flex-col py-1">
        {sections.map((section, index) => (
          <details key={section.key} open={index === 0} className="group border-b px-2 py-1 last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-2 text-body font-semibold outline-none select-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
              {section.title}
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-1 pt-1 pb-2">
              {section.items.map(({ key, label, Icon, data, className }) => (
                <button
                  key={key}
                  type="button"
                  onPointerDown={(event) => press(event, { kind: "new", data }, label, () => onAdd(data))}
                  onClick={(event) => event.detail === 0 && onAdd(data)}
                  className="flex cursor-grab touch-none items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left text-body transition-colors outline-none select-none hover:border-border hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/30 active:cursor-grabbing"
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Card>
  )
}

export { BuilderMenu }
