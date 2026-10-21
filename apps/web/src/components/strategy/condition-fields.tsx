"use client"

import { XIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/input"
import type { Translate } from "@/lib/i18n"
import {
  conditionKinds,
  conditionSpecs,
  DEFAULT_TREND_PERIOD,
  periodicLabel,
  takesOptions,
  type Condition,
  type ConditionKind,
  type RuleKind,
  type RuleSide,
} from "@/lib/strategy"
import { CandlePatternPicker } from "./candle-pattern-picker"

const families = (t: Translate): { family: RuleKind; label: string }[] => [
  { family: "indicator", label: t("Indicadores", "Indicators") },
  { family: "price", label: t("Precio", "Price") },
  { family: "volume", label: t("Volumen", "Volume") },
  { family: "pattern", label: t("Patrones de velas", "Candlestick patterns") },
  { family: "periodic", label: t("Periódica", "Periodic") },
]

/** Condition kind picker + the fields of that kind. */
function ConditionEditor({
  id,
  side,
  condition: c,
  errors,
  onChange,
  onRemove,
  fieldsClassName,
  hideKind,
}: {
  id: string
  side: RuleSide
  condition: Condition
  errors: Record<string, string>
  onChange: (condition: Condition) => void
  onRemove?: () => void
  /** Grid of the fields (default: up to 4 columns). */
  fieldsClassName?: string
  /** Hide the kind picker and the card frame (the kind is fixed by the node being edited). */
  hideKind?: boolean
}) {
  const { locale, t } = useI18n()
  const candles = t("velas", "candles")
  // `set` merges a partial update of the same kind.
  const set = (patch: Partial<Condition>) => onChange({ ...c, ...patch } as Condition)
  const num = (field: string, label: string, value: number, extra?: { suffix?: string; step?: number; hint?: string }) => (
    <Field label={label} htmlFor={`${id}-${field}`} hint={<FieldError show error={errors[field]}>{extra?.hint}</FieldError>}>
      <NumberInput
        id={`${id}-${field}`}
        value={value}
        suffix={extra?.suffix}
        step={extra?.step}
        onValue={(v) => set({ [field]: v } as Partial<Condition>)}
      />
    </Field>
  )
  const select = <V extends string>(field: string, label: string, value: V, options: [V, string][]) => (
    <Field label={label} htmlFor={`${id}-${field}`}>
      <Select
        id={`${id}-${field}`}
        value={value}
        onChange={(event) => set({ [field]: event.target.value } as Partial<Condition>)}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </Select>
    </Field>
  )
  const direction = (up: string, down: string) => select("direction", t("Dirección", "Direction"), (c as { direction: "up" | "down" }).direction, [["up", up], ["down", down]])

  let fields: React.ReactNode
  switch (c.kind) {
    case "rsi":
      fields = (
        <>
          {num("period", t("Periodo", "Period"), c.period, { suffix: candles })}
          {select("op", t("Condición", "Condition"), c.op, [
            ["below", t("Por debajo de", "Below")],
            ["above", t("Por encima de", "Above")],
          ])}
          {num("value", t("Valor", "Value"), c.value)}
        </>
      )
      break
    case "ma-cross":
      fields = (
        <>
          {select("ma", t("Tipo de media", "Average type"), c.ma, [
            ["sma", t("Simple (SMA)", "Simple (SMA)")],
            ["ema", t("Exponencial (EMA)", "Exponential (EMA)")],
          ])}
          {num("fast", t("Media rápida", "Fast average"), c.fast, { suffix: candles })}
          {num("slow", t("Media lenta", "Slow average"), c.slow, { suffix: candles })}
          {direction(t("La rápida cruza al alza", "Fast crosses above"), t("La rápida cruza a la baja", "Fast crosses below"))}
        </>
      )
      break
    case "macd":
      fields = (
        <>
          {num("fast", t("Rápida", "Fast"), c.fast)}
          {num("slow", t("Lenta", "Slow"), c.slow)}
          {num("signal", t("Señal", "Signal"), c.signal)}
          {direction(t("Cruza al alza la señal", "Crosses above the signal"), t("Cruza a la baja la señal", "Crosses below the signal"))}
        </>
      )
      break
    case "bollinger":
      fields = (
        <>
          {num("period", t("Periodo", "Period"), c.period, { suffix: candles })}
          {num("stdDev", t("Desviaciones", "Std. deviations"), c.stdDev, { suffix: "σ", step: 0.1 })}
          {select("band", t("Condición", "Condition"), c.band, [
            ["lower", t("Cierre bajo la banda inferior", "Close below the lower band")],
            ["upper", t("Cierre sobre la banda superior", "Close above the upper band")],
          ])}
        </>
      )
      break
    case "donchian":
      fields = (
        <>
          {num("period", t("Canal de", "Channel of"), c.period, { suffix: candles })}
          {direction(t("Rompe el máximo", "Breaks the high"), t("Rompe el mínimo", "Breaks the low"))}
        </>
      )
      break
    case "price-change":
      fields = (
        <>
          {direction(t("El precio sube", "Price rises"), t("El precio cae", "Price falls"))}
          {num("pct", t("Más de un", "More than"), c.pct, { suffix: "%", step: 0.1 })}
          <Field label={t("Medido", "Measured")} htmlFor={`${id}-window`}>
            <Select
              id={`${id}-window`}
              value={c.lookback === "entry" ? "entry" : "candles"}
              onChange={(event) => set({ lookback: event.target.value === "entry" ? "entry" : 24 })}
            >
              <option value="candles">{t("En las últimas N velas", "Over the last N candles")}</option>
              <option value="entry">{t("Desde la compra", "Since the buy")}</option>
            </Select>
          </Field>
          {c.lookback !== "entry" && num("lookback", t("Velas", "Candles"), c.lookback, { suffix: candles })}
        </>
      )
      break
    case "volume":
      fields = (
        <>
          {select("op", t("Condición", "Condition"), c.op, [
            ["above", t("Supera", "Exceeds")],
            ["below", t("Cae por debajo de", "Drops below")],
          ])}
          {num("multiple", t("Múltiplo de la media", "Multiple of the average"), c.multiple, { suffix: "×", step: 0.1 })}
          {num("period", t("Media de", "Average of"), c.period, { suffix: candles })}
        </>
      )
      break
    case "candle-pattern":
      fields = <CandlePatternPicker id={id} value={c.pattern} onChange={(pattern) => set({ pattern })} />
      break
    case "periodic":
      fields = select("every", t("Frecuencia", "Frequency"), c.every, [
        ["day", periodicLabel.day[locale]],
        ["week", periodicLabel.week[locale]],
        ["month", periodicLabel.month[locale]],
      ])
      break
  }

  return (
    <div className={cn("flex flex-col gap-3", !hideKind && "rounded-lg border bg-card p-3")}>
      {!hideKind && (
      <div className="flex items-end gap-2">
        <Field label={t("Condición", "Condition")} htmlFor={`${id}-kind`} className="flex-1 sm:max-w-64">
          <Select
            id={`${id}-kind`}
            value={c.kind}
            onChange={(event) => onChange(conditionSpecs[event.target.value as ConditionKind].defaults(side))}
          >
            {families(t).map(({ family, label }) => (
              <optgroup key={family} label={label}>
                {conditionKinds
                  .filter((kind) => conditionSpecs[kind].family === family)
                  .map((kind) => (
                    <option key={kind} value={kind}>
                      {conditionSpecs[kind].name[locale]}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" aria-label={t("Quitar condición", "Remove condition")} onClick={onRemove}>
            <XIcon />
          </Button>
        )}
      </div>
      )}
      <div className={cn("grid gap-3", fieldsClassName ?? "sm:grid-cols-2 xl:grid-cols-4")}>{fields}</div>
      {takesOptions(c) && (
        <fieldset className="flex flex-col gap-3 border-t pt-3">
          <legend className="sr-only">{t("Ajustes avanzados", "Advanced settings")}</legend>
          <p className="text-caption font-semibold text-muted-foreground">{t("Ajustes avanzados", "Advanced settings")}</p>
          <div className={cn("grid gap-3", fieldsClassName ?? "sm:grid-cols-2 xl:grid-cols-4")}>
            <Field
              label={t("Dirección del mercado", "Market direction")}
              htmlFor={`${id}-trend`}
              hint={t("Alcista: el precio está sobre su media exponencial.", "Rising: the price is above its exponential average.")}
            >
              <Select
                id={`${id}-trend`}
                value={c.trend ?? "any"}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === "any") set({ trend: undefined, trendPeriod: undefined })
                  else set({ trend: value as "up" | "down", trendPeriod: c.trendPeriod ?? DEFAULT_TREND_PERIOD })
                }}
              >
                <option value="any">{t("Ambas (sin filtro)", "Either (no filter)")}</option>
                <option value="up">{t("Solo alcista", "Rising only")}</option>
                <option value="down">{t("Solo bajista", "Falling only")}</option>
              </Select>
            </Field>
            {c.trend && num("trendPeriod", t("Media de tendencia (EMA)", "Trend average (EMA)"), c.trendPeriod ?? DEFAULT_TREND_PERIOD, { suffix: candles })}
            {num("lasts", t("Señal activa durante", "Signal active for"), c.lasts ?? 1, {
              suffix: candles,
              hint: t("1 = solo la vela en que ocurre.", "1 = only the candle it happens on."),
            })}
          </div>
        </fieldset>
      )}
    </div>
  )
}

/** Error in red when `show`, otherwise the regular hint (`children`). */
function FieldError({ show, error, children }: { show: boolean; error?: string; children?: React.ReactNode }) {
  if (show && error) return <span className="font-semibold text-down">{error}</span>
  return children ?? null
}

/** Controlled number input; an empty field is NaN (caught by validation). */
function NumberInput({
  id,
  value,
  onValue,
  suffix,
  step,
}: {
  id: string
  value: number
  onValue: (value: number) => void
  suffix?: string
  step?: number
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step ?? "any"}
        value={Number.isNaN(value) ? "" : value}
        onChange={(event) => onValue(event.target.valueAsNumber)}
        className={suffix ? "pr-16" : undefined}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-caption font-semibold text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

export { ConditionEditor, FieldError, NumberInput, families }
