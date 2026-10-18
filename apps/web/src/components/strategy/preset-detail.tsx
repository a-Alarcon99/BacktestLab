"use client"

import Link from "next/link"
import { ChevronRightIcon, LockIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPreset, presetInfo } from "@/lib/preset-strategies"
import { numberFormat } from "@/lib/format"
import { conditionSpecs, describeSize, specOf, type Rule } from "@/lib/strategy"
import { ruleKinds } from "./rule-kind"

/** Read-only view of a built-in strategy: its settings, rules and the reasoning behind them. */
function PresetDetail({ id }: { id: string }) {
  const { locale, t, href } = useI18n()
  const strategy = getPreset(id, locale)
  const info = presetInfo[id]
  const number = numberFormat(locale, { maximumFractionDigits: 2 })

  if (!strategy || !info) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-12 text-center">
        <p className="font-semibold">{t("Estrategia no encontrada", "Strategy not found")}</p>
        <Link href={href("/strategies")} className={buttonVariants({ variant: "outline" })}>
          {t("Volver a estrategias", "Back to strategies")}
        </Link>
      </div>
    )
  }

  const buy = strategy.rules.filter((r) => r.side === "buy")
  const sell = strategy.rules.filter((r) => r.side === "sell")

  return (
    <>
      <div className="flex flex-col gap-3">
        <nav aria-label={t("Ruta", "Breadcrumb")} className="flex items-center gap-1 text-caption text-muted-foreground">
          <Link href={href("/strategies")} className="hover:text-foreground">
            {t("Estrategias", "Strategies")}
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="truncate font-semibold text-foreground">{strategy.name}</span>
        </nav>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1>{strategy.name}</h1>
            <Badge>{info.horizonLabel[locale]}</Badge>
            <Badge variant="outline">
              <LockIcon className="size-3" />
              {t("Predefinida · solo lectura", "Built-in · read-only")}
            </Badge>
          </div>
          <p className="max-w-2xl text-muted-foreground">{info.summary[locale]}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Ajustes", "Settings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Setting label={t("Capital inicial", "Initial capital")} value={`${number.format(strategy.initialCapital)} USDT`} />
          <Setting label={t("Comisión por orden", "Fee per order")} value={`${number.format(strategy.feePct)}${t(" %", "%")}`} />
          <Setting label={t("Temporalidad recomendada", "Recommended timeframe")} value={info.timeframe[locale]} />
          <Setting label={t("Duración típica", "Typical holding time")} value={info.holding[locale]} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <RuleGroup title={t("Reglas de compra", "Buy rules")} rules={buy} />
        <RuleGroup title={t("Reglas de venta", "Sell rules")} rules={sell} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Por qué estas reglas", "Why these rules")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {info.rationale.map((line) => (
              <li key={line.es}>{line[locale]}</li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground">
            <span className="font-semibold text-foreground">{t("Cuándo falla: ", "When it fails: ")}</span>
            {info.risk[locale]}
          </p>
        </CardContent>
      </Card>

      <p className="text-caption text-muted-foreground">
        {t(
          "Las estrategias predefinidas no se pueden modificar. Para adaptar una, crea una estrategia nueva con reglas similares.",
          "Built-in strategies can't be changed. To adapt one, create a new strategy with similar rules."
        )}
      </p>
    </>
  )
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  )
}

function RuleGroup({ title, rules }: { title: string; rules: Rule[] }) {
  const { locale, t } = useI18n()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {rules.map((rule) => {
            const { Icon, label } = ruleKinds[specOf(rule.conditions[0]).family]
            return (
              <li key={rule.id} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                    rule.side === "buy" ? "bg-up-soft text-up" : "bg-down-soft text-down"
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="sr-only">{label[locale]}</span>
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <ul className="flex flex-col gap-0.5">
                    {rule.conditions.map((c, i) => (
                      <li key={i}>
                        {i > 0 && (
                          <span className="mr-1 text-caption font-semibold text-muted-foreground">{t("Y", "AND")}</span>
                        )}
                        <span className="mr-1 text-caption text-muted-foreground">
                          {conditionSpecs[c.kind].name[locale]}:
                        </span>
                        {specOf(c).describe(c, locale)}
                      </li>
                    ))}
                  </ul>
                  <span className="text-caption font-semibold">→ {describeSize(rule, locale)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export { PresetDetail }
