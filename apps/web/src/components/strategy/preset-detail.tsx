"use client"

import Link from "next/link"
import { ChevronRightIcon, LockIcon } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPreset, presetInfo } from "@/lib/preset-strategies"
import { conditionSpecs, describeSize, specOf, type Rule } from "@/lib/strategy"
import { ruleKinds } from "./rule-kind"

const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })

/** Read-only view of a built-in strategy: its settings, rules and the reasoning behind them. */
function PresetDetail({ id }: { id: string }) {
  const strategy = getPreset(id)
  const info = presetInfo[id]

  if (!strategy || !info) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-12 text-center">
        <p className="font-semibold">Estrategia no encontrada</p>
        <Link href="/strategies" className={buttonVariants({ variant: "outline" })}>
          Volver a estrategias
        </Link>
      </div>
    )
  }

  const buy = strategy.rules.filter((r) => r.side === "buy")
  const sell = strategy.rules.filter((r) => r.side === "sell")

  return (
    <>
      <div className="flex flex-col gap-3">
        <nav aria-label="Ruta" className="flex items-center gap-1 text-caption text-muted-foreground">
          <Link href="/strategies" className="hover:text-foreground">
            Estrategias
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="truncate font-semibold text-foreground">{strategy.name}</span>
        </nav>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1>{strategy.name}</h1>
            <Badge>{info.horizonLabel}</Badge>
            <Badge variant="outline">
              <LockIcon className="size-3" />
              Predefinida · solo lectura
            </Badge>
          </div>
          <p className="max-w-2xl text-muted-foreground">{info.summary}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ajustes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Setting label="Capital inicial" value={`${number.format(strategy.initialCapital)} USDT`} />
          <Setting label="Comisión por orden" value={`${number.format(strategy.feePct)} %`} />
          <Setting label="Temporalidad recomendada" value={info.timeframe} />
          <Setting label="Duración típica" value={info.holding} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <RuleGroup title="Reglas de compra" rules={buy} />
        <RuleGroup title="Reglas de venta" rules={sell} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por qué estas reglas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {info.rationale.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-caption text-muted-foreground">
            <span className="font-semibold text-foreground">Cuándo falla: </span>
            {info.risk}
          </p>
        </CardContent>
      </Card>

      <p className="text-caption text-muted-foreground">
        Las estrategias predefinidas no se pueden modificar. Para adaptar una, crea una estrategia nueva con reglas
        similares.
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
                  <span className="sr-only">{label}</span>
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <ul className="flex flex-col gap-0.5">
                    {rule.conditions.map((c, i) => (
                      <li key={i}>
                        {i > 0 && <span className="mr-1 text-caption font-semibold text-muted-foreground">Y</span>}
                        <span className="mr-1 text-caption text-muted-foreground">
                          {conditionSpecs[c.kind].name}:
                        </span>
                        {specOf(c).describe(c)}
                      </li>
                    ))}
                  </ul>
                  <span className="text-caption font-semibold">→ {describeSize(rule)}</span>
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
