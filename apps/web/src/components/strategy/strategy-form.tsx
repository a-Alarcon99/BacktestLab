"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangleIcon, InfoIcon, PlusIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Input, Select } from "@/components/ui/input"
import { saveStrategy, useStrategies } from "@/lib/storage/strategies"
import {
  conditionKinds,
  conditionSpecs,
  DEFAULT_CAPITAL,
  DEFAULT_FEE_PCT,
  describeRule,
  hasErrors,
  MAX_CONDITIONS,
  MAX_RULES,
  newRule,
  validateStrategy,
  type Condition,
  type ConditionKind,
  type Rule,
  type RuleKind,
  type RuleSide,
  type Strategy,
  type StrategyDraft,
  type StrategyErrors,
} from "@/lib/strategy"
import { ruleKinds } from "./rule-kind"

const sideCopy = {
  buy: { title: "Reglas de compra", add: "Añadir regla de compra", badge: "up", tag: "Entrada", noun: "compra" },
  sell: { title: "Reglas de venta", add: "Añadir regla de venta", badge: "down", tag: "Salida", noun: "venta" },
} as const

type RuleErrors = StrategyErrors["rules"][string]
type UpdateRule = (id: string, update: (rule: Rule) => Rule) => void

/**
 * Strategy form: name, capital, fee and the buy/sell rule builders. Creates a new strategy, or
 * edits `strategy` when given. A rule = 1–3 conditions that must all hold + the order size; rules
 * and conditions can't contradict each other (`findConflicts`). Saves to this browser.
 */
function StrategyForm({ strategy }: { strategy?: Strategy }) {
  const router = useRouter()
  const editing = strategy !== undefined
  const { data: strategies } = useStrategies()
  const [draft, setDraft] = useState<StrategyDraft>(() => ({
    name: strategy?.name ?? "",
    initialCapital: strategy?.initialCapital ?? DEFAULT_CAPITAL,
    feePct: strategy?.feePct ?? DEFAULT_FEE_PCT,
    rules: strategy?.rules ?? [],
  }))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const errors = useMemo(() => {
    const taken = (strategies ?? []).filter((s) => s.id !== strategy?.id).map((s) => s.name)
    return validateStrategy(draft, taken)
  }, [draft, strategies, strategy?.id])

  const buy = draft.rules.filter((r) => r.side === "buy")
  const sell = draft.rules.filter((r) => r.side === "sell")
  const canAddRule = draft.rules.length < MAX_RULES

  const updateRule: UpdateRule = (id, update) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? update(r) : r)) }))
  const addRule = (side: RuleSide, family: RuleKind) =>
    setDraft((d) => ({ ...d, rules: [...d.rules, newRule(side, family)] }))
  const removeRule = (id: string) => setDraft((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (hasErrors(errors)) return
    setSaving(true)
    try {
      await saveStrategy(draft, strategy?.id)
      router.push("/strategies")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la estrategia.")
      setSaving(false)
    }
  }

  // Conflicts show as soon as they appear; missing data only after a save attempt.
  const blocking = [
    ...(submitted ? errors.general : []),
    ...new Set(Object.values(errors.rules).flatMap((r) => r.conflicts)),
  ]

  return (
    <form
      noValidate
      onSubmit={submit}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--container-aside)] lg:items-start lg:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Información</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nombre de la estrategia"
              htmlFor="name"
              className="sm:col-span-2"
              hint={
                <FieldError show={submitted} error={errors.name}>
                  Debe ser único: no puede haber dos estrategias con el mismo nombre.
                </FieldError>
              }
            >
              <Input
                id="name"
                name="name"
                placeholder="Ej. RSI con filtro de volumen"
                value={draft.name}
                onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                autoComplete="off"
                maxLength={80}
              />
            </Field>
            <Field
              label="Capital inicial"
              htmlFor="capital"
              hint={<FieldError show={submitted} error={errors.initialCapital} />}
            >
              <NumberInput
                id="capital"
                suffix="USDT"
                value={draft.initialCapital}
                onValue={(initialCapital) => setDraft((d) => ({ ...d, initialCapital }))}
              />
            </Field>
            <Field
              label="Comisión por orden"
              htmlFor="fee"
              hint={
                <FieldError show={submitted} error={errors.feePct}>
                  Binance spot cobra un 0,1 %.
                </FieldError>
              }
            >
              <NumberInput
                id="fee"
                suffix="%"
                step={0.01}
                value={draft.feePct}
                onValue={(feePct) => setDraft((d) => ({ ...d, feePct }))}
              />
            </Field>
          </CardContent>
        </Card>

        {(["buy", "sell"] as const).map((side) => (
          <RuleSection
            key={side}
            side={side}
            rules={side === "buy" ? buy : sell}
            errors={errors.rules}
            showErrors={submitted}
            canAdd={canAddRule}
            onAdd={(family) => addRule(side, family)}
            onUpdate={updateRule}
            onRemove={removeRule}
          />
        ))}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+2rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
            <Badge variant={editing ? "primary" : "default"}>{editing ? "Editando" : "Borrador"}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-up-soft px-3 py-2.5">
                <dt className="text-caption text-muted-foreground">Compra</dt>
                <dd className="num text-title font-bold text-up">
                  {buy.length} {buy.length === 1 ? "regla" : "reglas"}
                </dd>
              </div>
              <div className="rounded-lg bg-down-soft px-3 py-2.5">
                <dt className="text-caption text-muted-foreground">Venta</dt>
                <dd className="num text-title font-bold text-down">
                  {sell.length} {sell.length === 1 ? "regla" : "reglas"}
                </dd>
              </div>
            </dl>
            {blocking.length > 0 ? (
              <ul className="flex flex-col gap-2 rounded-lg bg-down-soft px-3 py-2.5 text-caption text-down">
                {blocking.map((message) => (
                  <li key={message} className="flex items-start gap-2">
                    <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                    {message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-caption text-muted-foreground">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                Las condiciones de una regla se cumplen a la vez (Y). Una regla de compra y otra de venta no pueden
                activarse con el mismo indicador a la vez. Máximo {MAX_RULES} reglas.
              </p>
            )}
            {saveError && <p className="text-caption font-semibold text-down">{saveError}</p>}
          </CardContent>
          <footer className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end md:px-5 lg:flex-col-reverse xl:flex-row">
            <Link href="/strategies" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Cancelar
            </Link>
            <Button type="submit" size="lg" disabled={saving || !strategies}>
              <SaveIcon data-icon="inline-start" />
              {editing ? "Guardar cambios" : "Guardar estrategia"}
            </Button>
          </footer>
        </Card>
      </aside>
    </form>
  )
}

/** One side of the strategy: its rules plus the picker to add another one. */
function RuleSection({
  side,
  rules,
  errors,
  showErrors,
  canAdd,
  onAdd,
  onUpdate,
  onRemove,
}: {
  side: RuleSide
  rules: Rule[]
  errors: StrategyErrors["rules"]
  showErrors: boolean
  canAdd: boolean
  onAdd: (family: RuleKind) => void
  onUpdate: UpdateRule
  onRemove: (id: string) => void
}) {
  const copy = sideCopy[side]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <Badge variant={copy.badge}>{copy.tag}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rules.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-caption text-muted-foreground">
            Todavía no hay reglas de {copy.noun}.
            {side === "sell" && " Sin reglas de venta, la posición se mantiene hasta el final del backtest."}
          </p>
        )}
        {rules.map((rule, index) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            position={index + 1}
            errors={errors[rule.id]}
            showErrors={showErrors}
            onUpdate={(update) => onUpdate(rule.id, update)}
            onRemove={() => onRemove(rule.id)}
          />
        ))}
        <div className="flex flex-col gap-2 border-t pt-4">
          <span className="text-caption font-semibold text-muted-foreground">
            {canAdd ? copy.add : `Has llegado al máximo de ${MAX_RULES} reglas.`}
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(ruleKinds) as RuleKind[]).map((kind) => {
              const { Icon, label, description } = ruleKinds[kind]
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={!canAdd}
                  onClick={() => onAdd(kind)}
                  className="group flex flex-col items-start gap-1 rounded-lg border border-dashed border-border-strong p-3 text-left transition-colors outline-none hover:border-primary hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <PlusIcon className="size-3.5 text-muted-foreground group-hover:text-primary" />
                    <Icon className="size-4 text-muted-foreground group-hover:text-primary" />
                    {label}
                  </span>
                  <span className="text-caption text-muted-foreground">{description}</span>
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** A rule: its conditions (AND), the order size and the conflicts it is involved in. */
function RuleCard({
  rule,
  position,
  errors,
  showErrors,
  onUpdate,
  onRemove,
}: {
  rule: Rule
  position: number
  errors: RuleErrors
  showErrors: boolean
  onUpdate: (update: (rule: Rule) => Rule) => void
  onRemove: () => void
}) {
  const id = `rule-${rule.id}`
  const setCondition = (index: number, condition: Condition) =>
    onUpdate((r) => ({ ...r, conditions: r.conditions.map((c, i) => (i === index ? condition : c)) }))
  const addCondition = () =>
    onUpdate((r) => {
      // Suggest a kind the rule doesn't use yet, so the new condition doesn't clash.
      const used = new Set(r.conditions.map((c) => c.kind))
      const kind = (["volume", "rsi", "price-change", ...conditionKinds] as ConditionKind[]).find((k) => !used.has(k))!
      return { ...r, conditions: [...r.conditions, conditionSpecs[kind].defaults(r.side)] }
    })
  const removeCondition = (index: number) =>
    onUpdate((r) => ({ ...r, conditions: r.conditions.filter((_, i) => i !== index) }))

  return (
    <div
      className={
        errors.conflicts.length > 0
          ? "flex flex-col gap-3 rounded-lg border border-down/50 bg-down-soft/30 p-3 md:p-4"
          : "flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 md:p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="primary">
          Regla {sideCopy[rule.side].noun} {position}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Eliminar regla de ${sideCopy[rule.side].noun} ${position}`}
          className="hover:bg-down-soft hover:text-down"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {rule.conditions.map((condition, index) => (
          <div key={index} className="flex flex-col gap-2">
            {index > 0 && (
              <span className="self-start rounded-md bg-muted px-2 py-0.5 text-caption font-semibold text-muted-foreground">
                Y
              </span>
            )}
            <ConditionEditor
              id={`${id}-c${index}`}
              side={rule.side}
              condition={condition}
              errors={showErrors ? errors.conditions[index] : {}}
              onChange={(next) => setCondition(index, next)}
              onRemove={rule.conditions.length > 1 ? () => removeCondition(index) : undefined}
            />
          </div>
        ))}
        {rule.conditions.length < MAX_CONDITIONS && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={addCondition}>
            <PlusIcon data-icon="inline-start" />
            Añadir condición (Y)
          </Button>
        )}
      </div>

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        {rule.side === "buy" ? (
          <>
            <Field label="Tamaño de la compra" htmlFor={`${id}-unit`}>
              <Select
                id={`${id}-unit`}
                value={rule.size.unit}
                onChange={(event) => {
                  const unit = event.target.value as Rule["size"]["unit"]
                  onUpdate((r) => ({ ...r, size: { unit, value: 100 } }))
                }}
              >
                <option value="pct">% del efectivo disponible</option>
                <option value="usdt">Importe fijo en USDT</option>
              </Select>
            </Field>
            <Field
              label={rule.size.unit === "pct" ? "Porcentaje" : "Importe"}
              htmlFor={`${id}-size`}
              hint={<FieldError show={showErrors} error={errors.size} />}
            >
              <NumberInput
                id={`${id}-size`}
                suffix={rule.size.unit === "pct" ? "%" : "USDT"}
                value={rule.size.value}
                onValue={(value) => onUpdate((r) => ({ ...r, size: { ...r.size, value } }))}
              />
            </Field>
          </>
        ) : (
          <Field
            label="Vender de la posición abierta"
            htmlFor={`${id}-size`}
            hint={<FieldError show={showErrors} error={errors.size} />}
          >
            <NumberInput
              id={`${id}-size`}
              suffix="%"
              value={rule.size.value}
              onValue={(value) => onUpdate((r) => ({ ...r, size: { unit: "pct", value } }))}
            />
          </Field>
        )}
      </div>

      <p className="text-caption text-muted-foreground">{describeRule(rule)}</p>
      {errors.conflicts.map((message) => (
        <p key={message} className="flex items-start gap-2 text-caption font-semibold text-down">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
          {message}
        </p>
      ))}
    </div>
  )
}

const families: { family: RuleKind; label: string }[] = [
  { family: "indicator", label: "Indicadores" },
  { family: "price", label: "Precio" },
  { family: "volume", label: "Volumen" },
  { family: "periodic", label: "Periódica" },
]

/** Condition kind picker + the fields of that kind. */
function ConditionEditor({
  id,
  side,
  condition: c,
  errors,
  onChange,
  onRemove,
}: {
  id: string
  side: RuleSide
  condition: Condition
  errors: Record<string, string>
  onChange: (condition: Condition) => void
  onRemove?: () => void
}) {
  // `set` merges a partial update of the same kind.
  const set = (patch: Partial<Condition>) => onChange({ ...c, ...patch } as Condition)
  const num = (field: string, label: string, value: number, extra?: { suffix?: string; step?: number }) => (
    <Field label={label} htmlFor={`${id}-${field}`} hint={<FieldError show error={errors[field]} />}>
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
  const direction = (up: string, down: string) => select("direction", "Dirección", (c as { direction: "up" | "down" }).direction, [["up", up], ["down", down]])

  let fields: React.ReactNode
  switch (c.kind) {
    case "rsi":
      fields = (
        <>
          {num("period", "Periodo", c.period, { suffix: "velas" })}
          {select("op", "Condición", c.op, [["below", "Por debajo de"], ["above", "Por encima de"]])}
          {num("value", "Valor", c.value)}
        </>
      )
      break
    case "ma-cross":
      fields = (
        <>
          {select("ma", "Tipo de media", c.ma, [["sma", "Simple (SMA)"], ["ema", "Exponencial (EMA)"]])}
          {num("fast", "Media rápida", c.fast, { suffix: "velas" })}
          {num("slow", "Media lenta", c.slow, { suffix: "velas" })}
          {direction("La rápida cruza al alza", "La rápida cruza a la baja")}
        </>
      )
      break
    case "macd":
      fields = (
        <>
          {num("fast", "Rápida", c.fast)}
          {num("slow", "Lenta", c.slow)}
          {num("signal", "Señal", c.signal)}
          {direction("Cruza al alza la señal", "Cruza a la baja la señal")}
        </>
      )
      break
    case "bollinger":
      fields = (
        <>
          {num("period", "Periodo", c.period, { suffix: "velas" })}
          {num("stdDev", "Desviaciones", c.stdDev, { suffix: "σ", step: 0.1 })}
          {select("band", "Condición", c.band, [
            ["lower", "Cierre bajo la banda inferior"],
            ["upper", "Cierre sobre la banda superior"],
          ])}
        </>
      )
      break
    case "donchian":
      fields = (
        <>
          {num("period", "Canal de", c.period, { suffix: "velas" })}
          {direction("Rompe el máximo", "Rompe el mínimo")}
        </>
      )
      break
    case "price-change":
      fields = (
        <>
          {direction("El precio sube", "El precio cae")}
          {num("pct", "Más de un", c.pct, { suffix: "%", step: 0.1 })}
          <Field label="Medido" htmlFor={`${id}-window`}>
            <Select
              id={`${id}-window`}
              value={c.lookback === "entry" ? "entry" : "candles"}
              onChange={(event) => set({ lookback: event.target.value === "entry" ? "entry" : 24 })}
            >
              <option value="candles">En las últimas N velas</option>
              <option value="entry">Desde la compra</option>
            </Select>
          </Field>
          {c.lookback !== "entry" && num("lookback", "Velas", c.lookback, { suffix: "velas" })}
        </>
      )
      break
    case "volume":
      fields = (
        <>
          {select("op", "Condición", c.op, [["above", "Supera"], ["below", "Cae por debajo de"]])}
          {num("multiple", "Múltiplo de la media", c.multiple, { suffix: "×", step: 0.1 })}
          {num("period", "Media de", c.period, { suffix: "velas" })}
        </>
      )
      break
    case "periodic":
      fields = select("every", "Frecuencia", c.every, [
        ["day", "Cada día"],
        ["week", "Cada semana (lunes)"],
        ["month", "Cada mes (día 1)"],
      ])
      break
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-end gap-2">
        <Field label="Condición" htmlFor={`${id}-kind`} className="flex-1 sm:max-w-64">
          <Select
            id={`${id}-kind`}
            value={c.kind}
            onChange={(event) => onChange(conditionSpecs[event.target.value as ConditionKind].defaults(side))}
          >
            {families.map(({ family, label }) => (
              <optgroup key={family} label={label}>
                {conditionKinds
                  .filter((kind) => conditionSpecs[kind].family === family)
                  .map((kind) => (
                    <option key={kind} value={kind}>
                      {conditionSpecs[kind].name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" aria-label="Quitar condición" onClick={onRemove}>
            <XIcon />
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{fields}</div>
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

export { StrategyForm }
