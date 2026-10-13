"use client"

import { useState } from "react"
import Link from "next/link"
import { EyeIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import { presetInfo, presetStrategies } from "@/lib/preset-strategies"
import { deleteStrategy, useStrategies } from "@/lib/storage/strategies"
import { describeRule, ruleFamily, type Strategy } from "@/lib/strategy"
import { ruleKinds } from "./rule-kind"
import { RunStrategyButton, type RunnableAsset } from "./run-strategy-button"

const capitalFormat = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })

/** "3 estrategias creadas", once the browser data is read. */
function StrategyCount() {
  const { data } = useStrategies()
  if (!data) return null
  return (
    <span className="num font-semibold text-foreground">
      {data.length} {data.length === 1 ? "estrategia creada" : "estrategias creadas"}.
    </span>
  )
}

/**
 * Grid of the user's strategies, closed by a "new strategy" placeholder card. `assets` and
 * `today` feed the run-backtest pop-up of each card.
 */
function StrategyList({ assets, today }: { assets: RunnableAsset[]; today: string }) {
  const { data: strategies } = useStrategies()

  if (!strategies) {
    return (
      <div aria-hidden className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
        <div className="hidden h-64 animate-pulse rounded-xl bg-muted/40 md:block" />
      </div>
    )
  }

  return (
    <>
    <section aria-labelledby="presets-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="presets-title" className="text-title font-bold">
          Estrategias predefinidas
        </h2>
        <p className="text-caption text-muted-foreground">
          Una por horizonte temporal. No se pueden modificar, pero puedes ver sus reglas y ejecutarlas.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {presetStrategies.map((strategy) => (
          <li key={strategy.id}>
            <StrategyCard strategy={strategy} assets={assets} today={today} />
          </li>
        ))}
      </ul>
    </section>
    <section aria-labelledby="own-title" className="flex flex-col gap-3">
      <h2 id="own-title" className="text-title font-bold">
        Mis estrategias
      </h2>
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {strategies.map((strategy) => (
        <li key={strategy.id}>
          <StrategyCard strategy={strategy} assets={assets} today={today} />
        </li>
      ))}
      <li>
        <Link
          href="/strategies/new"
          className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-4 text-center text-muted-foreground transition-colors outline-none hover:border-primary hover:bg-accent/50 hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <PlusIcon className="size-5" />
          </span>
          <span className="font-semibold text-foreground">
            {strategies.length === 0 ? "Crea tu primera estrategia" : "Nueva estrategia"}
          </span>
          <span className="max-w-56 text-caption">Combina reglas de compra y venta para crear la tuya.</span>
        </Link>
      </li>
    </ul>
    </section>
    </>
  )
}

function StrategyCard({
  strategy,
  assets,
  today,
}: {
  strategy: Strategy
  assets: RunnableAsset[]
  today: string
}) {
  const [confirming, setConfirming] = useState(false)
  const preset = presetInfo[strategy.id]
  const buy = strategy.rules.filter((r) => r.side === "buy")
  const sell = strategy.rules.filter((r) => r.side === "sell")

  return (
    <article className="flex h-full flex-col rounded-xl border bg-card text-card-foreground">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="truncate text-body font-semibold">{strategy.name}</h2>
          <div className="flex flex-wrap gap-2">
            {preset && <Badge>{preset.horizonLabel}</Badge>}
            <Badge variant="up">{buy.length} compra</Badge>
            <Badge variant="down">{sell.length} venta</Badge>
            <Badge variant="outline" className="num">
              {capitalFormat.format(strategy.initialCapital)} USDT
            </Badge>
          </div>
        </div>
        {preset ? (
          <span className="mt-1 shrink-0 text-muted-foreground" title="Predefinida: no se puede modificar">
            <LockIcon className="size-4" />
            <span className="sr-only">Predefinida: no se puede modificar</span>
          </span>
        ) : confirming ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteStrategy(strategy.id)}>
              Eliminar
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Eliminar ${strategy.name}`}
            className="hover:bg-down-soft hover:text-down"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon />
          </Button>
        )}
      </header>

      <ul className="flex flex-1 flex-col gap-2.5 px-4 py-4 md:px-5">
        {strategy.rules.map((rule) => {
          const { Icon, label } = ruleKinds[ruleFamily(rule)]
          return (
            <li key={rule.id} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                  rule.side === "buy" ? "bg-up-soft text-up" : "bg-down-soft text-down"
                )}
              >
                <Icon className="size-3.5" />
                <span className="sr-only">
                  {rule.side === "buy" ? "Compra" : "Venta"} · {label}
                </span>
              </span>
              <span className="min-w-0">{describeRule(rule)}</span>
            </li>
          )
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-4 py-3 md:px-5">
        <span className="text-caption text-muted-foreground">
          {preset ? (
            <>
              Velas: <span className="num">{preset.timeframe}</span>
            </>
          ) : (
            <>
              Actualizada el <span className="num">{formatDate(strategy.updatedAt)}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2">
          <Link
            href={preset ? `/strategies/${strategy.id}` : `/strategies/${strategy.id}/edit`}
            aria-label={`${preset ? "Ver reglas de" : "Editar"} ${strategy.name}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {preset ? <EyeIcon data-icon="inline-start" /> : <PencilIcon data-icon="inline-start" />}
            {preset ? "Ver reglas" : "Editar"}
          </Link>
          <RunStrategyButton strategy={strategy} assets={assets} today={today} />
        </span>
      </footer>
    </article>
  )
}

export { StrategyCount, StrategyList }
