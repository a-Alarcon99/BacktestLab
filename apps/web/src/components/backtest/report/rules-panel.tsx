"use client"

import { useId, useMemo, useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"
import { StrategyCanvas } from "@/components/strategy/builder/strategy-canvas"
import type { Rule } from "@/lib/strategy"
import { rulesToGraph } from "@/lib/strategy-graph"
import { useReplayText } from "../replay/format"

/**
 * The rules the backtest ran, in the same panel of nodes the strategy editor uses but read-only.
 * Folded by default; PDF and PNG exports unfold it (`data-collapsible`, see globals.css).
 */
export function RulesPanel({ rules }: { rules: Rule[] }) {
  const { t } = useReplayText()
  const [open, setOpen] = useState(false)
  const id = useId()
  const graph = useMemo(() => rulesToGraph(rules, 0), [rules])

  return (
    <section aria-label={t("Reglas de la estrategia", "Strategy rules")} data-rules className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-left font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {t("Reglas de la estrategia", "Strategy rules")}
        <ChevronDownIcon data-print-hide className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div
        id={id}
        data-collapsible
        inert={!open}
        className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-t p-4">
            <p className="text-caption text-muted-foreground">
              {t(
                "Las reglas tal como se ejecutaron en este backtest. Cada línea une las condiciones que deben cumplirse a la vez para comprar o vender.",
                "The rules as they ran in this backtest. Each wire joins the conditions that must hold together to buy or sell."
              )}
            </p>
            <StrategyCanvas graph={graph} readOnly minRows={1} className="max-h-[40rem] touch-pan-y" />
          </div>
        </div>
      </div>
    </section>
  )
}
