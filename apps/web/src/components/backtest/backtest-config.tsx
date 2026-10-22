"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FlaskConicalIcon, PlayIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { useAssetView } from "@/components/market/asset-view"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
  defaultTimeframe,
  earliestFrom,
  estimateCandles,
  maxBacktestCandles,
  rangeFits,
  presetFrom,
  rangePresetLabels,
  rangePresets,
  timeframes,
  type RangePreset,
  type Timeframe,
} from "@/lib/candles"
import { formatDate, numberFormat } from "@/lib/format"
import { isPreset } from "@/lib/preset-strategies"
import { useRunnableStrategies } from "@/lib/storage/strategies"
import { REPLAY_DIALOG_CLASS, ReplayPlayer, type ReplayRun } from "./backtest-replay"

const DEFAULT_PRESET: RangePreset = "3A"


/**
 * Backtest parameters: date range (presets + explicit from/to) and timeframe first, because
 * they define the dataset; then one of the user's strategies (which carries the capital). The
 * timeframe is independent from the price chart's. "Ejecutar backtest" opens the replay pop-up.
 */
function BacktestConfig({
  symbol,
  historySince,
  today,
}: {
  symbol: string
  historySince: string
  /** Current UTC date (YYYY-MM-DD): upper bound and default end of the range. */
  today: string
}) {
  const { data: strategies } = useRunnableStrategies()
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const [preset, setPreset] = useState<RangePreset | null>(DEFAULT_PRESET)
  const [from, setFrom] = useState(() => presetFrom(DEFAULT_PRESET, today, historySince))
  const [to, setTo] = useState(today)
  const [strategyId, setStrategyId] = useState<string | null>(null)
  const { replayOpen, setReplayOpen } = useAssetView()
  const { locale, t, href } = useI18n()
  const candleCount = numberFormat(locale, { useGrouping: "always" })
  const capitalFormat = numberFormat(locale, { maximumFractionDigits: 2 })

  // Defaults to the user's most recently updated strategy (else the first preset) until one is picked.
  const strategy =
    strategies?.find((s) => s.id === strategyId) ?? strategies?.find((s) => !isPreset(s.id)) ?? strategies?.[0]
  const valid = from !== "" && to !== "" && from <= to && from >= historySince && to <= today
  const candles = valid ? estimateCandles(from, to, timeframe) : 0
  const rangeOk = valid && candles >= 2 && candles <= maxBacktestCandles
  // Short timeframes cover few days per backtest: longer presets can't be chosen.
  const tooLongPresets = rangePresets.filter(
    (p) => !rangeFits(presetFrom(p, today, historySince), today, timeframe)
  )

  function changeTimeframe(next: Timeframe) {
    setTimeframe(next)
    if (valid && !rangeFits(from, to, next)) {
      // Keep the end of the range and cut its start to what a backtest of this timeframe allows.
      const earliest = earliestFrom(to, next)
      setFrom(earliest > historySince ? earliest : historySince)
      setPreset(null)
    }
  }

  // Stable while the inputs don't change: a new object would start a new run.
  const run = useMemo<ReplayRun | null>(
    () => (rangeOk && strategy ? { symbol, strategy, timeframe, from, to, mode: "new" } : null),
    [rangeOk, symbol, strategy, timeframe, from, to]
  )

  return (
    <Card id="backtest" className="scroll-mt-[calc(var(--spacing-header)+1rem)]">
      <CardHeader>
        <CardTitle>{t("Configurar backtest", "Set up backtest")}</CardTitle>
        <Badge>{t("Borrador", "Draft")}</Badge>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <Field label={t("Rango de fechas", "Date range")} className="lg:col-span-2">
          <SegmentedControl
            label={t("Rango predefinido", "Preset range")}
            options={rangePresets}
            labels={rangePresetLabels[locale]}
            disabled={tooLongPresets}
            value={preset ?? ("" as RangePreset)}
            onValueChange={(next) => {
              setPreset(next)
              setFrom(presetFrom(next, today, historySince))
              setTo(today)
            }}
            size="sm"
            className="self-start"
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <DateInput
              id="from"
              label={t("Desde", "From")}
              value={from}
              min={historySince}
              max={to || today}
              onChange={(event) => {
                setPreset(null)
                setFrom(event.target.value)
              }}
            />
            <span aria-hidden className="hidden text-muted-foreground sm:block">→</span>
            <DateInput
              id="to"
              label={t("Hasta", "To")}
              value={to}
              min={from || historySince}
              max={today}
              onChange={(event) => {
                setPreset(null)
                setTo(event.target.value)
              }}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            {t("Histórico disponible desde", "History available since")}{" "}
            <span className="num font-semibold">{formatDate(historySince, locale)}</span>
          </p>
        </Field>

        <Field label={t("Temporalidad", "Timeframe")} className="lg:col-span-2">
          <SegmentedControl
            label={t("Temporalidad", "Timeframe")}
            options={timeframes}
            value={timeframe}
            onValueChange={changeTimeframe}
            className="w-full"
          />
        </Field>

        <Field
          label={t("Estrategia", "Strategy")}
          htmlFor="strategy"
          className="lg:col-span-2"
          hint={
            strategy && (
              <>
                {t("Capital inicial", "Initial capital")}{" "}
                <span className="num font-semibold">{capitalFormat.format(strategy.initialCapital)} USDT</span> ·{" "}
                {t("comisión", "fee")}{" "}
                <span className="num font-semibold">
                  {capitalFormat.format(strategy.feePct)}
                  {t(" %", "%")}
                </span>{" "}
                ·{" "}
                <Link
                  href={href(`/strategies/${strategy.id}${isPreset(strategy.id) ? "" : "/edit"}`)}
                  className="text-primary hover:underline"
                >
                  {isPreset(strategy.id) ? t("Ver reglas", "View rules") : t("Editar estrategia", "Edit strategy")}
                </Link>
                {(strategy.recommendedTimeframe || strategy.recommendedRange) && (
                  <span className="mt-1 block">
                    {t("Recomendado:", "Recommended:")}{" "}
                    {strategy.recommendedTimeframe && (
                      <>
                        {t("temporalidad", "timeframe")}{" "}
                        <span className="num font-semibold">{strategy.recommendedTimeframe}</span>
                      </>
                    )}
                    {strategy.recommendedTimeframe && strategy.recommendedRange && " · "}
                    {strategy.recommendedRange && (
                      <>
                        {t("periodo", "period")}{" "}
                        <span className="num font-semibold">{rangePresetLabels[locale][strategy.recommendedRange]}</span>
                      </>
                    )}
                  </span>
                )}
              </>
            )
          }
        >
          {strategies === undefined ? (
            <div aria-hidden className="h-10 animate-pulse rounded-lg bg-muted/40" />
          ) : strategies.length === 0 ? (
            <NoStrategies />
          ) : (
            <Select
              id="strategy"
              name="strategy"
              value={strategy?.id}
              onChange={(event) => setStrategyId(event.target.value)}
            >
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </CardContent>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <p className="num text-caption text-muted-foreground">
          {valid ? (
            <>
              <span className="font-semibold text-foreground">{symbol}/USDT</span> · {formatDate(from, locale)} →{" "}
              {formatDate(to, locale)} · {timeframe} · ≈ {candleCount.format(candles)} {t("velas", "candles")}
            </>
          ) : (
            t("Revisa el rango de fechas.", "Check the date range.")
          )}
          {valid && candles > maxBacktestCandles && (
            <span className="block text-destructive">
              {t(
                `Máximo ${candleCount.format(maxBacktestCandles)} velas por backtest: acorta el rango o usa una temporalidad mayor.`,
                `At most ${candleCount.format(maxBacktestCandles)} candles per backtest: shorten the range or use a longer timeframe.`
              )}
            </span>
          )}
        </p>
        <Button
          size="lg"
          type="button"
          className="hidden lg:inline-flex"
          disabled={!run}
          onClick={() => setReplayOpen(true)}
        >
          <PlayIcon data-icon="inline-start" />
          {t("Ejecutar backtest", "Run backtest")}
        </Button>
      </footer>

      <Dialog open={replayOpen} onOpenChange={setReplayOpen}>
        <DialogContent className={run ? REPLAY_DIALOG_CLASS : "w-[min(32rem,calc(100vw-1.5rem))]"}>
          {run ? (
            <ReplayPlayer run={run} onClose={() => setReplayOpen(false)} />
          ) : (
            <NotRunnable reason={strategies?.length === 0 ? "no-strategy" : "range"} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function NoStrategies() {
  const { t, href } = useI18n()
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-caption text-muted-foreground">
        {t(
          "Todavía no tienes estrategias. Crea una con sus reglas de compra y venta para poder ejecutar el backtest.",
          "You don't have any strategies yet. Create one with its buy and sell rules to run the backtest."
        )}
      </p>
      <Link href={href("/strategies/new")} className={buttonVariants({ size: "sm", className: "shrink-0" })}>
        {t("Crea tu primera estrategia", "Create your first strategy")}
      </Link>
    </div>
  )
}

/** Shown by the mobile action bar when the config can't run yet. */
function NotRunnable({ reason }: { reason: "no-strategy" | "range" }) {
  const { t, href } = useI18n()
  return (
    <>
      <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <FlaskConicalIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <DialogTitle className="text-title font-bold">
            {reason === "no-strategy" ? t("Necesitas una estrategia", "You need a strategy") : t("Revisa la configuración", "Check the settings")}
          </DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">
            {reason === "no-strategy"
              ? t("Crea una estrategia para poder ejecutar el backtest.", "Create a strategy to run the backtest.")
              : t(
                  "El rango de fechas no es válido, o es demasiado corto o largo para la temporalidad elegida.",
                  "The date range isn't valid, or it is too short or too long for the chosen timeframe."
                )}
          </DialogDescription>
        </div>
        <DialogClose />
      </header>
      {reason === "no-strategy" && (
        <footer className="flex justify-end px-4 py-3 md:px-5">
          <Link href={href("/strategies/new")} className={buttonVariants()}>
            {t("Crear estrategia", "Create strategy")}
          </Link>
        </footer>
      )}
    </>
  )
}

function DateInput({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-caption font-semibold text-muted-foreground">
        {label}
      </span>
      <Input id={id} name={id} type="date" className="pl-16 [&::-webkit-calendar-picker-indicator]:opacity-60" {...props} />
    </div>
  )
}

export { BacktestConfig }
