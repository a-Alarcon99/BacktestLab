import Link from "next/link"
import { InfoIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Input, Select } from "@/components/ui/input"
import { draftRules, type RuleKind, type RuleSide, type Strategy, type StrategyRule } from "@/lib/strategies-mock"
import { ruleKinds } from "./rule-kind"

const sideCopy = {
  buy: { title: "Reglas de compra", add: "Añadir regla de compra", badge: "up", tag: "Entrada" },
  sell: { title: "Reglas de venta", add: "Añadir regla de venta", badge: "down", tag: "Salida" },
} as const

/**
 * Strategy form (UI only): name + buy and sell rule builders. Creates a new strategy, or edits
 * `strategy` when given. Each rule is one of the families in `ruleKinds`; a strategy can combine
 * several as long as they do not contradict each other.
 */
function StrategyForm({ strategy }: { strategy?: Strategy }) {
  const editing = strategy !== undefined
  const rules = strategy?.rules ?? draftRules
  const buy = rules.filter((r) => r.side === "buy")
  const sell = rules.filter((r) => r.side === "sell")

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--container-aside)] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Información</CardTitle>
          </CardHeader>
          <CardContent>
            <Field
              label="Nombre de la estrategia"
              htmlFor="name"
              hint="Debe ser único: no puede haber dos estrategias con el mismo nombre."
            >
              <Input
                id="name"
                name="name"
                placeholder="Ej. RSI con filtro de volumen"
                defaultValue={strategy?.name}
                autoComplete="off"
              />
            </Field>
          </CardContent>
        </Card>

        <RuleSection side="buy" rules={buy} />
        <RuleSection side="sell" rules={sell} />
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
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-caption text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              Las reglas de una misma estrategia no pueden contradecirse, por ejemplo comprar y vender con el mismo
              umbral del mismo indicador.
            </p>
          </CardContent>
          <footer className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end md:px-5 lg:flex-col-reverse xl:flex-row">
            <Link href="/strategies" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Cancelar
            </Link>
            <Button type="button" size="lg">
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
function RuleSection({ side, rules }: { side: RuleSide; rules: StrategyRule[] }) {
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
            Todavía no hay reglas de {side === "buy" ? "compra" : "venta"}.
          </p>
        )}
        {rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
        <div className="flex flex-col gap-2 border-t pt-4">
          <span className="text-caption font-semibold text-muted-foreground">{copy.add}</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(ruleKinds) as RuleKind[]).map((kind) => {
              const { Icon, label, description } = ruleKinds[kind]
              return (
                <button
                  key={kind}
                  type="button"
                  className="group flex flex-col items-start gap-1 rounded-lg border border-dashed border-border-strong p-3 text-left transition-colors outline-none hover:border-primary hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/30"
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

/** A configured rule: family badge, remove button and its fields. */
function RuleRow({ rule }: { rule: StrategyRule }) {
  const { Icon, label } = ruleKinds[rule.kind]
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="primary">
          <Icon />
          {label}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Eliminar regla"
          className="hover:bg-down-soft hover:text-down"
        >
          <Trash2Icon />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <RuleFields rule={rule} />
      </div>
    </div>
  )
}

/** Fields of each rule family, prefilled from the rule's parameters. */
function RuleFields({ rule }: { rule: StrategyRule }) {
  const id = `${rule.side}-${rule.id}`
  switch (rule.kind) {
    case "indicator":
      return (
        <>
          <Field label="Indicador" htmlFor={`${id}-indicator`}>
            <Select id={`${id}-indicator`} defaultValue={rule.params.indicator}>
              <option value="rsi">RSI (14)</option>
              <option value="sma-cross">Cruce SMA 20/50</option>
              <option value="macd">MACD (12, 26, 9)</option>
              <option value="donchian">Canal Donchian</option>
            </Select>
          </Field>
          <Field label="Condición" htmlFor={`${id}-condition`}>
            <Select id={`${id}-condition`} defaultValue={rule.params.condition}>
              <option value="below">Cae por debajo de</option>
              <option value="above">Sube por encima de</option>
            </Select>
          </Field>
          <Field label="Umbral" htmlFor={`${id}-threshold`}>
            <Input id={`${id}-threshold`} type="number" defaultValue={rule.params.threshold} />
          </Field>
        </>
      )
    case "price":
      return (
        <>
          <Field label="Variación" htmlFor={`${id}-direction`}>
            <Select id={`${id}-direction`} defaultValue={rule.params.direction}>
              <option value="down">El precio cae</option>
              <option value="up">El precio sube</option>
            </Select>
          </Field>
          <Field label="Umbral" htmlFor={`${id}-threshold`}>
            <Suffixed id={`${id}-threshold`} suffix="%" defaultValue={rule.params.threshold} />
          </Field>
          <Field label="Medido en" htmlFor={`${id}-window`}>
            <Select id={`${id}-window`} defaultValue={rule.params.window}>
              <option value="1h">1 hora</option>
              <option value="24h">24 horas</option>
              <option value="7d">7 días</option>
              <option value="entry">Desde la compra</option>
            </Select>
          </Field>
        </>
      )
    case "volume":
      return (
        <>
          <Field label="Condición" htmlFor={`${id}-condition`}>
            <Select id={`${id}-condition`} defaultValue={rule.params.condition}>
              <option value="above">El volumen supera</option>
              <option value="below">El volumen cae por debajo de</option>
            </Select>
          </Field>
          <Field label="Múltiplo de la media" htmlFor={`${id}-multiple`}>
            <Suffixed id={`${id}-multiple`} suffix="×" defaultValue={rule.params.multiple} step={0.1} />
          </Field>
          <Field label="Media de" htmlFor={`${id}-period`}>
            <Suffixed id={`${id}-period`} suffix="velas" defaultValue={rule.params.period} />
          </Field>
        </>
      )
    case "periodic":
      return (
        <>
          <Field label="Frecuencia" htmlFor={`${id}-every`}>
            <Select id={`${id}-every`} defaultValue={rule.params.every}>
              <option value="day">Cada día</option>
              <option value="week">Cada semana</option>
              <option value="month">Cada mes</option>
            </Select>
          </Field>
          <Field label="Importe por orden" htmlFor={`${id}-amount`}>
            <Suffixed id={`${id}-amount`} suffix="USDT" defaultValue={rule.params.amount} />
          </Field>
        </>
      )
  }
}

function Suffixed({
  id,
  suffix,
  defaultValue,
  step,
}: {
  id: string
  suffix: string
  defaultValue: number
  step?: number
}) {
  return (
    <div className="relative">
      <Input id={id} type="number" defaultValue={defaultValue} min={0} step={step} className="pr-14" />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-caption font-semibold text-muted-foreground">
        {suffix}
      </span>
    </div>
  )
}

export { StrategyForm }
