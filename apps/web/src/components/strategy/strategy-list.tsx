"use client"

import { useState } from "react"
import Link from "next/link"
import { EyeIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatDate, numberFormat } from "@/lib/format"
import { presetInfo, presetStrategiesFor } from "@/lib/preset-strategies"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { deleteStrategy, useStrategies } from "@/lib/storage/strategies"
import { describeRule, ruleFamily, type Strategy } from "@/lib/strategy"
import { ruleKinds } from "./rule-kind"
import { RunStrategyButton, type RunnableAsset } from "./run-strategy-button"

/** "3 estrategias creadas", once the browser data is read. */
function StrategyCount() {
  const { data } = useStrategies()
  const { t } = useI18n()
  if (!data) return null
  return (
    <span className="num font-semibold text-foreground">
      {data.length}{" "}
      {data.length === 1 ? t("estrategia creada", "strategy created") : t("estrategias creadas", "strategies created")}.
    </span>
  )
}

/**
 * Grid of the user's strategies, closed by a "new strategy" placeholder card. `assets` and
 * `today` feed the run-backtest pop-up of each card.
 */
function StrategyList({ assets, today }: { assets: RunnableAsset[]; today: string }) {
  const { data: strategies } = useStrategies()
  const { locale, t, href } = useI18n()

  // The built-in strategies don't depend on the visitor: they are rendered right away (and are in
  // the server HTML, with their links); only the user's own list waits for the server.
  return (
    <>
    <section aria-labelledby="presets-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="presets-title" className="text-title font-bold">
          {t("Estrategias predefinidas", "Built-in strategies")}
        </h2>
        <p className="text-caption text-muted-foreground">
          {t(
            "Una por horizonte temporal. No se pueden modificar, pero puedes ver sus reglas y ejecutarlas.",
            "One per time horizon. They can't be changed, but you can see their rules and run them."
          )}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {presetStrategiesFor(locale).map((strategy) => (
          <li key={strategy.id}>
            <StrategyCard strategy={strategy} assets={assets} today={today} />
          </li>
        ))}
      </ul>
    </section>
    <section aria-labelledby="own-title" className="flex flex-col gap-3">
      <h2 id="own-title" className="text-title font-bold">
        {t("Mis estrategias", "My strategies")}
      </h2>
    {!strategies ? (
      <div aria-hidden className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
        <div className="hidden h-64 animate-pulse rounded-xl bg-muted/40 md:block" />
      </div>
    ) : (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {strategies.map((strategy) => (
        <li key={strategy.id}>
          <StrategyCard strategy={strategy} assets={assets} today={today} />
        </li>
      ))}
      <li>
        <Link
          href={href("/strategies/new")}
          className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-4 text-center text-muted-foreground transition-colors outline-none hover:border-primary hover:bg-accent/50 hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <PlusIcon className="size-5" />
          </span>
          <span className="font-semibold text-foreground">
            {strategies.length === 0 ? t("Crea tu primera estrategia", "Create your first strategy") : t("Nueva estrategia", "New strategy")}
          </span>
          <span className="max-w-56 text-caption">
            {t("Combina reglas de compra y venta para crear la tuya.", "Combine buy and sell rules to build your own.")}
          </span>
        </Link>
      </li>
    </ul>
    )}
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
  const { locale, t, href } = useI18n()
  const capitalFormat = numberFormat(locale, { maximumFractionDigits: 2 })
  const preset = presetInfo[strategy.id]
  const buy = strategy.rules.filter((r) => r.side === "buy")
  const sell = strategy.rules.filter((r) => r.side === "sell")

  return (
    <article className="flex h-full flex-col rounded-xl border bg-card text-card-foreground">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="truncate text-body font-semibold">{strategy.name}</h2>
          <div className="flex flex-wrap gap-2">
            {preset && <Badge>{preset.horizonLabel[locale]}</Badge>}
            <Badge variant="up">
              {buy.length} {t("compra", "buy")}
            </Badge>
            <Badge variant="down">
              {sell.length} {t("venta", "sell")}
            </Badge>
            <Badge variant="outline" className="num">
              {capitalFormat.format(strategy.initialCapital)} USDT
            </Badge>
          </div>
        </div>
        {preset ? (
          <span
            className="mt-1 shrink-0 text-muted-foreground"
            title={t("Predefinida: no se puede modificar", "Built-in: can't be changed")}
          >
            <LockIcon className="size-4" />
            <span className="sr-only">{t("Predefinida: no se puede modificar", "Built-in: can't be changed")}</span>
          </span>
) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t(`Eliminar ${strategy.name}`, `Delete ${strategy.name}`)}
            className="hover:bg-down-soft hover:text-down"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon />
          </Button>
        )}
      </header>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("Eliminar estrategia", "Delete strategy")}
        description={t(
          `«${strategy.name}» se eliminará de este navegador. Los backtests ya ejecutados se conservan en el historial.`,
          `"${strategy.name}" will be deleted from this browser. Backtests already run stay in the history.`
        )}
        onConfirm={() => deleteStrategy(strategy.id)}
      />

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
                  {rule.side === "buy" ? t("Compra", "Buy") : t("Venta", "Sell")} · {label[locale]}
                </span>
              </span>
              <span className="min-w-0">{describeRule(rule, locale)}</span>
            </li>
          )
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-4 py-3 md:px-5">
        <span className="text-caption text-muted-foreground">
          {preset ? (
            <>
              {t("Velas: ", "Candles: ")}
              <span className="num">{preset.timeframe[locale]}</span>
            </>
          ) : (
            <>
              {t("Actualizada el ", "Updated ")}
              <span className="num">{formatDate(strategy.updatedAt, locale)}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2">
          <Link
            href={href(preset ? `/strategies/${strategy.id}` : `/strategies/${strategy.id}/edit`)}
            aria-label={`${preset ? t("Ver reglas de", "View rules of") : t("Editar", "Edit")} ${strategy.name}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {preset ? <EyeIcon data-icon="inline-start" /> : <PencilIcon data-icon="inline-start" />}
            {preset ? t("Ver reglas", "View rules") : t("Editar", "Edit")}
          </Link>
          <RunStrategyButton strategy={strategy} assets={assets} today={today} />
        </span>
      </footer>
    </article>
  )
}

export { StrategyCount, StrategyList }
