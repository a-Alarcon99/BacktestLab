import Link from "next/link"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import type { Strategy } from "@/lib/strategies-mock"
import { ruleKinds } from "./rule-kind"
import { RunStrategyButton, type RunnableAsset } from "./run-strategy-button"

/**
 * Grid of saved strategies, closed by a "new strategy" placeholder card. `assets` and `today`
 * feed the run-backtest pop-up of each card.
 */
function StrategyList({
  strategies,
  assets,
  today,
}: {
  strategies: Strategy[]
  assets: RunnableAsset[]
  today: string
}) {
  return (
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
          <span className="font-semibold text-foreground">Nueva estrategia</span>
          <span className="max-w-56 text-caption">Combina reglas de compra y venta para crear la tuya.</span>
        </Link>
      </li>
    </ul>
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
  const buy = strategy.rules.filter((r) => r.side === "buy")
  const sell = strategy.rules.filter((r) => r.side === "sell")

  return (
    <article className="flex h-full flex-col rounded-xl border bg-card text-card-foreground">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="truncate text-body font-semibold">{strategy.name}</h2>
          <div className="flex flex-wrap gap-2">
            <Badge variant="up">{buy.length} compra</Badge>
            <Badge variant="down">{sell.length} venta</Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${strategy.name}`} className="hover:bg-down-soft hover:text-down">
          <Trash2Icon />
        </Button>
      </header>

      <ul className="flex flex-1 flex-col gap-2.5 px-4 py-4 md:px-5">
        {strategy.rules.map((rule) => {
          const { Icon, label } = ruleKinds[rule.kind]
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
              <span className="min-w-0">{rule.summary}</span>
            </li>
          )
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-4 py-3 md:px-5">
        <span className="text-caption text-muted-foreground">
          Actualizada el <span className="num">{formatDate(strategy.updatedAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          <Link
            href={`/strategies/${strategy.id}/edit`}
            aria-label={`Editar ${strategy.name}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <PencilIcon data-icon="inline-start" />
            Editar
          </Link>
          <RunStrategyButton strategy={strategy.name} assets={assets} today={today} />
        </span>
      </footer>
    </article>
  )
}

export { StrategyList }
