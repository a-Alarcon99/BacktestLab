"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { quotaText, useMe } from "@/lib/session"

/** Compact summary of the plan and how much of it is used. Display only: the server enforces. */
function PlanUsage() {
  const me = useMe()
  if (!me) return null
  const { plan, usage } = me
  const rows: { label: string; value: string; hint?: string }[] = []
  if (plan.maxBacktestsTotal !== null)
    rows.push({ label: "Backtests", value: quotaText(usage.backtestsTotal, plan.maxBacktestsTotal), hint: "en total" })
  if (plan.maxBacktestsPerDay !== null)
    rows.push({
      label: "Backtests hoy",
      value: quotaText(usage.backtestsToday, plan.maxBacktestsPerDay),
      hint: "se reinicia a las 00:00 UTC",
    })
  if (plan.maxStrategies !== null)
    rows.push({
      label: "Estrategias creadas",
      value: quotaText(usage.strategiesCreated, plan.maxStrategies),
      hint: "borrarlas no libera cupo",
    })

  return (
    <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Badge variant="primary">Plan {plan.name}</Badge>
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <span className="text-caption text-muted-foreground">{row.label}</span>
            <span className="num font-semibold" title={row.hint}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {!me.user && (
        <Link href="/signup" className={buttonVariants({ size: "sm", className: "self-start sm:self-auto" })}>
          Crea una cuenta gratis para ampliar tus límites
        </Link>
      )}
    </aside>
  )
}

/** Shown next to a "limit reached" message: guests are pointed to sign-up. */
function LimitCta() {
  const me = useMe()
  if (!me || me.user) return null
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Link href="/signup" className={buttonVariants({ size: "sm" })}>
        Crear cuenta gratis
      </Link>
      <Link href="/login" className={buttonVariants({ size: "sm", variant: "outline" })}>
        Ya tengo cuenta
      </Link>
    </div>
  )
}

export { LimitCta, PlanUsage }
