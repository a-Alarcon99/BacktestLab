"use client"

import { useRef } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { findConflicts, specOf, type Condition } from "@/lib/strategy"
import { useShouldPlay } from "../motion"

// M3 · Contradictions: two opposite conditions are joined with AND, bump into each other and the
// real check of the editor (`findConflicts`) explains why the rule could never buy.

const HIGH: Condition = { kind: "rsi", period: 14, op: "above", value: 70 }
const LOW: Condition = { kind: "rsi", period: 14, op: "below", value: 30 }
const LOOP = "6s ease-in-out infinite"

function ConflictArt() {
  const { locale, t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const { play } = useShouldPlay(ref)
  const message =
    findConflicts([{ id: "demo", side: "buy", conditions: [HIGH, LOW], size: { unit: "pct", value: 100 } }], locale)[0]
      ?.message ?? ""
  const chip =
    "lp-anim flex h-9 items-center rounded-xl border-2 border-chart-3 bg-card px-3 text-caption font-semibold whitespace-nowrap shadow-sm"

  return (
    <div ref={ref} data-paused={play ? "false" : "true"} className="flex flex-col items-center gap-4 py-2">
      <div className="flex items-center gap-2">
        <span className={chip} style={{ animation: `lp-conflict-left ${LOOP}, lp-conflict-border ${LOOP}` }}>
          {specOf(HIGH).describe(HIGH, locale)}
        </span>
        <span
          className="lp-anim flex h-6 min-w-9 items-center justify-center rounded-full border-2 border-primary bg-card px-1.5 text-[0.6875rem] font-bold text-primary"
          style={{ animation: `lp-conflict-join ${LOOP}` }}
        >
          {t("Y", "AND")}
        </span>
        <span className={chip} style={{ animation: `lp-conflict-right ${LOOP}, lp-conflict-border ${LOOP}` }}>
          {specOf(LOW).describe(LOW, locale)}
        </span>
      </div>
      <div
        role="note"
        className="lp-anim flex max-w-sm items-start gap-2 rounded-xl border border-chart-3/40 bg-chart-3/10 px-3 py-2.5 text-caption"
        style={{ animation: `lp-conflict-warn ${LOOP}` }}
      >
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-chart-3" />
        <span>
          <span className="font-semibold">{message}</span>{" "}
          <span className="text-muted-foreground">
            {t("Nunca se cumplirían a la vez: el editor te avisa antes de ejecutar.", "They can never hold together: the editor tells you before you run it.")}
          </span>
        </span>
      </div>
    </div>
  )
}

export { ConflictArt }
