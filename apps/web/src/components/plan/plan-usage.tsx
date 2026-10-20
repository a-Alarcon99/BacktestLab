"use client"

import Link from "next/link"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { intlLocale } from "@/lib/i18n"
import { buttonVariants } from "@/components/ui/button"
import { quotaText, useMe } from "@/lib/session"

/** Compact summary of the plan and how much of it is used. Display only: the server enforces. */
function PlanUsage() {
  const me = useMe()
  const { locale, t, href } = useI18n()
  if (!me) return null
  const { plan, usage } = me
  const rows: { label: string; value: string; hint?: string }[] = []
  if (plan.maxBacktestsTotal !== null)
    rows.push({
      label: "Backtests",
      value: quotaText(usage.backtestsTotal, plan.maxBacktestsTotal, locale),
      hint: t("en total", "in total"),
    })
  if (plan.maxBacktestsPerDay !== null)
    rows.push({
      label: t("Backtests hoy", "Backtests today"),
      value: quotaText(usage.backtestsToday, plan.maxBacktestsPerDay, locale),
      hint: t("se reinicia a las 00:00 UTC", "resets at 00:00 UTC"),
    })
  if (plan.maxStrategies !== null)
    rows.push({
      label: t("Estrategias creadas", "Strategies created"),
      value: quotaText(usage.strategiesCreated, plan.maxStrategies, locale),
      hint: t("borrarlas no libera cupo", "deleting them doesn't free up quota"),
    })

  return (
    <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Badge variant="primary">{t(`Plan ${plan.name}`, `${plan.name} plan`)}</Badge>
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <span className="text-caption text-muted-foreground">{row.label}</span>
            <span className="num font-semibold" title={row.hint}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {me.user && (
        <Link href={href("/plans")} className={buttonVariants({ size: "sm", variant: "outline", className: "self-start sm:self-auto" })}>
          {plan.expiresAt
            ? t("Activo hasta el ", "Active until ") + new Date(plan.expiresAt).toLocaleDateString(intlLocale[locale])
            : t("Mejorar plan", "Upgrade plan")}
        </Link>
      )}
      {!me.user && (
        <Link href={href("/signup")} className={buttonVariants({ size: "sm", className: "self-start sm:self-auto" })}>
          {t("Crea una cuenta gratis para ampliar tus límites", "Create a free account to raise your limits")}
        </Link>
      )}
    </aside>
  )
}

/** Shown next to a "limit reached" message: guests are pointed to sign-up. */
function LimitCta() {
  const me = useMe()
  const { t, href } = useI18n()
  if (!me) return null
  if (me.user)
    return (
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={href("/plans")} className={buttonVariants({ size: "sm" })}>
          {t("Ver planes", "View plans")}
        </Link>
      </div>
    )
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Link href={href("/signup")} className={buttonVariants({ size: "sm" })}>
        {t("Crear cuenta gratis", "Create a free account")}
      </Link>
      <Link href={href("/login")} className={buttonVariants({ size: "sm", variant: "outline" })}>
        {t("Ya tengo cuenta", "I already have an account")}
      </Link>
    </div>
  )
}

export { LimitCta, PlanUsage }
