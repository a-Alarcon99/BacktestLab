"use client"

import { cn } from "cn"
import type { Tone } from "@/lib/backtest-report"
import { toneSoft, toneText } from "../report/parts"

/** A labelled figure; coloured by its tone, or plain when it has none. */
export function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-lg p-3", tone ? toneSoft(tone) : "bg-muted/50")}>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn("num text-title font-bold", tone && toneText(tone))}>{value}</dd>
      {sub && <dd className="num text-[11px] text-muted-foreground">{sub}</dd>}
    </div>
  )
}
