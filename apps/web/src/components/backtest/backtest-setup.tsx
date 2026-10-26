"use client"

import { useState } from "react"
import Link from "next/link"
import { FlaskConicalIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { buttonVariants } from "@/components/ui/button"
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
  defaultTimeframe,
  earliestFrom,
  estimateCandles,
  maxBacktestCandles,
  presetFrom,
  rangeFits,
  rangePresetLabels,
  rangePresets,
  timeframes,
  type RangePreset,
  type Timeframe,
} from "@/lib/candles"
import { formatDate, numberFormat } from "@/lib/format"
import { isPreset } from "@/lib/preset-strategies"
import { useRunnableStrategies } from "@/lib/storage/strategies"

const DEFAULT_PRESET: RangePreset = "3A"

/**
 * State shared by every way of setting up a backtest: date range (presets + explicit from/to),
 * timeframe and the strategy (which carries the capital). `historySince` is the earliest day the
 * range may start; `today` the latest.
 */
export function useBacktestSetup({ today, historySince }: { today: string; historySince: string }) {
  const { data: strategies } = useRunnableStrategies()
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const [preset, setPreset] = useState<RangePreset | null>(DEFAULT_PRESET)
  const [from, setFrom] = useState(() => presetFrom(DEFAULT_PRESET, today, historySince))
  const [to, setTo] = useState(today)
  const [strategyId, setStrategyId] = useState<string | null>(null)

  // Defaults to the user's most recently updated strategy (else the first preset) until one is picked.
  const strategy =
    strategies?.find((s) => s.id === strategyId) ?? strategies?.find((s) => !isPreset(s.id)) ?? strategies?.[0]
  const valid = from !== "" && to !== "" && from <= to && from >= historySince && to <= today
  /** Candles of one asset over the range (an estimate). */
  const candles = valid ? estimateCandles(from, to, timeframe) : 0
  const rangeOk = valid && candles >= 2 && candles <= maxBacktestCandles

  function changeTimeframe(next: Timeframe) {
    setTimeframe(next)
    if (valid && !rangeFits(from, to, next)) {
      // Keep the end of the range and cut its start to what a backtest of this timeframe allows.
      const earliest = earliestFrom(to, next)
      setFrom(earliest > historySince ? earliest : historySince)
      setPreset(null)
    }
  }

  return {
    today,
    historySince,
    strategies,
    strategy,
    setStrategyId,
    timeframe,
    changeTimeframe,
    preset,
    setPreset,
    from,
    setFrom,
    to,
    setTo,
    valid,
    candles,
    rangeOk,
  }
}

export type BacktestSetup = ReturnType<typeof useBacktestSetup>

/** Date range, timeframe and strategy fields. `maxCandles` further limits the range (batches). */
export function BacktestSetupFields({ setup, maxCandles = maxBacktestCandles }: { setup: BacktestSetup; maxCandles?: number }) {
  const { locale, t, href } = useI18n()
  const capitalFormat = numberFormat(locale, { maximumFractionDigits: 2 })
  const { strategies, strategy, today, historySince, timeframe, preset, from, to } = setup
  // Short timeframes cover few days per backtest: longer presets can't be chosen.
  const tooLongPresets = rangePresets.filter(
    (p) => estimateCandles(presetFrom(p, today, historySince), today, timeframe) > maxCandles
  )

  return (
    <>
      <Field label={t("Rango de fechas", "Date range")} className="lg:col-span-2">
        <SegmentedControl
          label={t("Rango predefinido", "Preset range")}
          options={rangePresets}
          labels={rangePresetLabels[locale]}
          disabled={tooLongPresets}
          value={preset ?? ("" as RangePreset)}
          onValueChange={(next) => {
            setup.setPreset(next)
            setup.setFrom(presetFrom(next, today, historySince))
            setup.setTo(today)
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
              setup.setPreset(null)
              setup.setFrom(event.target.value)
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
              setup.setPreset(null)
              setup.setTo(event.target.value)
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
          onValueChange={setup.changeTimeframe}
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
          <Select id="strategy" name="strategy" value={strategy?.id} onChange={(event) => setup.setStrategyId(event.target.value)}>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </>
  )
}

export function NoStrategies() {
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

/** Shown (as a dialog) when the setup can't run yet. */
export function NotRunnable({ reason }: { reason: "no-strategy" | "range" | "assets" }) {
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
              : reason === "assets"
                ? t("Elige al menos dos activos para ejecutar el backtest.", "Pick at least two assets to run the backtest.")
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
