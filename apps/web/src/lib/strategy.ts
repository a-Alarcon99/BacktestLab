import type { RangePreset, Timeframe } from "@/lib/candles"

// Strategy model shared by the form, the list and the backtest request. Mirrors the API's
// `app/schemas/backtest.py`; contradiction rules mirror `app/strategies/validation.py`.

export type RuleSide = "buy" | "sell"
/** UI families used to group condition kinds. */
export type RuleKind = "indicator" | "price" | "volume" | "periodic"

type Op = "above" | "below"
type Direction = "up" | "down"

export type Condition =
  | { kind: "rsi"; period: number; op: Op; value: number }
  | { kind: "ma-cross"; ma: "sma" | "ema"; fast: number; slow: number; direction: Direction }
  | { kind: "macd"; fast: number; slow: number; signal: number; direction: Direction }
  /** upper: close above the upper band; lower: close below the lower band. */
  | { kind: "bollinger"; period: number; stdDev: number; band: "upper" | "lower" }
  /** Close breaks the high (up) or low (down) of the previous `period` candles. */
  | { kind: "donchian"; period: number; direction: Direction }
  /** Change over `lookback` candles, or since the average buy price ("entry"). */
  | { kind: "price-change"; direction: Direction; pct: number; lookback: number | "entry" }
  /** Volume vs. the average of the previous `period` candles. */
  | { kind: "volume"; op: Op; multiple: number; period: number }
  | { kind: "periodic"; every: "day" | "week" | "month" }

export type ConditionKind = Condition["kind"]
type ConditionOf<K extends ConditionKind> = Extract<Condition, { kind: K }>

/** Buy: % of the available cash or fixed USDT. Sell: % of the open position. */
export type OrderSize = { unit: "pct" | "usdt"; value: number }

export type Rule = {
  id: string
  side: RuleSide
  /** All must hold (AND). */
  conditions: Condition[]
  size: OrderSize
}

export type Strategy = {
  schemaVersion: 1
  id: string
  name: string
  /** USDT. */
  initialCapital: number
  /** Fee per order, in %. */
  feePct: number
  rules: Rule[]
  /** Optional hints shown when the strategy is picked for a backtest; they never constrain it. */
  recommendedTimeframe?: Timeframe
  recommendedRange?: RangePreset
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
}

export type StrategyDraft = Pick<
  Strategy,
  "name" | "initialCapital" | "feePct" | "rules" | "recommendedTimeframe" | "recommendedRange"
>

export const MAX_RULES = 10
export const MAX_CONDITIONS = 3
export const DEFAULT_CAPITAL = 10_000
export const DEFAULT_FEE_PCT = 0.1

const decimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })
const n = (value: number) => decimal.format(value)

type Interval = { type: "interval"; lo: number; hi: number }
type Choice = { type: "choice"; value: string }
type Constraint = Interval | Choice

const interval = (lo: number, hi: number): Interval => ({ type: "interval", lo, hi })
const choice = (value: string): Choice => ({ type: "choice", value })
const threshold = (op: Op, value: number) => (op === "above" ? interval(value, Infinity) : interval(-Infinity, value))

type ConditionSpec<C extends Condition> = {
  /** Name in the condition picker. */
  name: string
  family: RuleKind
  defaults: (side: RuleSide) => C
  describe: (c: C) => string
  /** What the condition looks at: same subject = comparable (see `findConflicts`). */
  subject: (c: C) => { key: string; label: string }
  constraint: (c: C) => Constraint
  /** Per-field errors, keyed by field name. */
  validate: (c: C) => Record<string, string>
}

const periodError = (value: number) =>
  Number.isInteger(value) && value >= 2 && value <= 200 ? undefined : "Entero entre 2 y 200"

function errors(entries: Record<string, string | undefined | false>) {
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v)) as Record<string, string>
}

/**
 * Registry of condition kinds. Adding one = an entry here, its fields in the strategy form and
 * its counterpart in the API (`app/strategies/conditions.py`).
 */
export const conditionSpecs: { [K in ConditionKind]: ConditionSpec<ConditionOf<K>> } = {
  rsi: {
    name: "RSI",
    family: "indicator",
    defaults: (side) => ({ kind: "rsi", period: 14, op: side === "buy" ? "below" : "above", value: side === "buy" ? 30 : 70 }),
    describe: (c) => `RSI (${c.period}) ${c.op === "above" ? "por encima de" : "por debajo de"} ${n(c.value)}`,
    subject: (c) => ({ key: `rsi:${c.period}`, label: `RSI (${c.period})` }),
    constraint: (c) => threshold(c.op, c.value),
    validate: (c) =>
      errors({ period: periodError(c.period), value: !(c.value > 0 && c.value < 100) && "Entre 0 y 100" }),
  },
  "ma-cross": {
    name: "Cruce de medias",
    family: "indicator",
    defaults: (side) => ({ kind: "ma-cross", ma: "sma", fast: 20, slow: 50, direction: side === "buy" ? "up" : "down" }),
    describe: (c) =>
      `${c.ma.toUpperCase()} ${c.fast} cruza ${c.direction === "up" ? "al alza" : "a la baja"} la ${c.ma.toUpperCase()} ${c.slow}`,
    subject: (c) => ({ key: `${c.ma}-cross:${c.fast}:${c.slow}`, label: `cruce ${c.ma.toUpperCase()} ${c.fast}/${c.slow}` }),
    constraint: (c) => choice(c.direction),
    validate: (c) =>
      errors({
        fast: periodError(c.fast),
        slow: periodError(c.slow) ?? (c.fast >= c.slow && "Debe ser mayor que la rápida"),
      }),
  },
  macd: {
    name: "MACD",
    family: "indicator",
    defaults: (side) => ({ kind: "macd", fast: 12, slow: 26, signal: 9, direction: side === "buy" ? "up" : "down" }),
    describe: (c) =>
      `MACD (${c.fast}, ${c.slow}, ${c.signal}) cruza ${c.direction === "up" ? "al alza" : "a la baja"} su señal`,
    subject: (c) => ({ key: `macd:${c.fast}:${c.slow}:${c.signal}`, label: `MACD (${c.fast}, ${c.slow}, ${c.signal})` }),
    constraint: (c) => choice(c.direction),
    validate: (c) =>
      errors({
        fast: periodError(c.fast),
        slow: periodError(c.slow) ?? (c.fast >= c.slow && "Debe ser mayor que la rápida"),
        signal: periodError(c.signal),
      }),
  },
  bollinger: {
    name: "Bandas de Bollinger",
    family: "indicator",
    defaults: (side) => ({ kind: "bollinger", period: 20, stdDev: 2, band: side === "buy" ? "lower" : "upper" }),
    describe: (c) =>
      `Cierre ${c.band === "upper" ? "por encima de la banda superior" : "por debajo de la banda inferior"} de Bollinger (${c.period}, ${n(c.stdDev)})`,
    subject: (c) => ({ key: `bollinger:${c.period}:${c.stdDev}`, label: `Bollinger (${c.period}, ${n(c.stdDev)})` }),
    constraint: (c) => choice(c.band),
    validate: (c) =>
      errors({ period: periodError(c.period), stdDev: !(c.stdDev >= 0.5 && c.stdDev <= 5) && "Entre 0,5 y 5" }),
  },
  donchian: {
    name: "Canal Donchian",
    family: "indicator",
    defaults: (side) => ({ kind: "donchian", period: 20, direction: side === "buy" ? "up" : "down" }),
    describe: (c) =>
      `El cierre rompe el ${c.direction === "up" ? "máximo" : "mínimo"} de las últimas ${c.period} velas`,
    subject: (c) => ({ key: `donchian:${c.period}`, label: `Donchian (${c.period})` }),
    constraint: (c) => choice(c.direction),
    validate: (c) => errors({ period: periodError(c.period) }),
  },
  "price-change": {
    name: "Variación de precio",
    family: "price",
    defaults: (side) =>
      side === "buy"
        ? { kind: "price-change", direction: "down", pct: 5, lookback: 24 }
        : { kind: "price-change", direction: "up", pct: 10, lookback: "entry" },
    describe: (c) =>
      `El precio ${c.direction === "up" ? "sube" : "cae"} más de un ${n(c.pct)} % ${
        c.lookback === "entry" ? "desde la compra" : `en ${c.lookback} ${c.lookback === 1 ? "vela" : "velas"}`
      }`,
    subject: (c) => ({
      key: `price-change:${c.lookback}`,
      label: c.lookback === "entry" ? "el precio desde la compra" : `el precio en ${c.lookback} velas`,
    }),
    constraint: (c) => (c.direction === "up" ? interval(c.pct, Infinity) : interval(-Infinity, -c.pct)),
    validate: (c) =>
      errors({
        pct: !(c.pct > 0 && c.pct <= 1000) && "Entre 0 y 1000",
        lookback:
          c.lookback !== "entry" &&
          !(Number.isInteger(c.lookback) && c.lookback >= 1 && c.lookback <= 200) &&
          "Entero entre 1 y 200",
      }),
  },
  volume: {
    name: "Volumen",
    family: "volume",
    defaults: () => ({ kind: "volume", op: "above", multiple: 1.5, period: 20 }),
    describe: (c) =>
      `Volumen ${c.op === "above" ? "por encima de" : "por debajo de"} ${n(c.multiple)}× su media de ${c.period} velas`,
    subject: (c) => ({ key: `volume:${c.period}`, label: `el volumen (media ${c.period})` }),
    constraint: (c) => threshold(c.op, c.multiple),
    validate: (c) =>
      errors({ multiple: !(c.multiple > 0 && c.multiple <= 100) && "Entre 0 y 100", period: periodError(c.period) }),
  },
  periodic: {
    name: "Periódica",
    family: "periodic",
    defaults: () => ({ kind: "periodic", every: "week" }),
    describe: (c) => ({ day: "Cada día", week: "Cada semana (lunes)", month: "Cada mes (día 1)" })[c.every],
    subject: (c) => ({ key: `periodic:${c.every}`, label: "la misma frecuencia" }),
    constraint: () => choice("on"),
    validate: () => ({}),
  },
}

export const conditionKinds = Object.keys(conditionSpecs) as ConditionKind[]

/** The registry entry of a condition, typed for the union. */
export function specOf(condition: Condition) {
  return conditionSpecs[condition.kind] as unknown as ConditionSpec<Condition>
}

/** Default condition of the first kind in a UI family. */
export function defaultCondition(family: RuleKind, side: RuleSide): Condition {
  const kind = conditionKinds.find((k) => conditionSpecs[k].family === family)!
  return conditionSpecs[kind].defaults(side)
}

export function newRule(side: RuleSide, family: RuleKind): Rule {
  const periodicBuy = side === "buy" && family === "periodic"
  return {
    id: crypto.randomUUID(),
    side,
    conditions: [defaultCondition(family, side)],
    size: periodicBuy ? { unit: "usdt", value: 100 } : { unit: "pct", value: 100 },
  }
}

export function describeSize(rule: Rule) {
  if (rule.side === "sell") return `vender ${n(rule.size.value)} % de la posición`
  return rule.size.unit === "usdt" ? `comprar ${n(rule.size.value)} USDT` : `comprar ${n(rule.size.value)} % del efectivo`
}

/** Human-readable rule: "RSI (14) por debajo de 30 y … → comprar 50 % del efectivo". */
export function describeRule(rule: Rule) {
  const conditions = rule.conditions.map((c) => specOf(c).describe(c))
  const text = conditions.map((c, i) => (i === 0 ? c : c.charAt(0).toLowerCase() + c.slice(1))).join(" y ")
  return `${text} → ${describeSize(rule)}`
}

/** UI family of a rule (that of its first condition), for icons. */
export function ruleFamily(rule: Rule): RuleKind {
  return specOf(rule.conditions[0]).family
}

export type Conflict = { ruleIds: string[]; message: string }

type MergedRule = {
  rule: Rule
  name: string
  constraints: Map<string, Constraint>
  labels: Map<string, string>
  valid: boolean
}

function sameConstraint(a: Constraint, b: Constraint) {
  if (a.type === "interval") return b.type === "interval" && a.lo === b.lo && a.hi === b.hi
  return b.type === "choice" && a.value === b.value
}

function intersect(a: Interval, b: Interval) {
  return interval(Math.max(a.lo, b.lo), Math.min(a.hi, b.hi))
}

const isEmpty = (i: Interval) => i.lo >= i.hi

function merge(rule: Rule, name: string, conflicts: Conflict[]): MergedRule {
  const merged: MergedRule = { rule, name, constraints: new Map(), labels: new Map(), valid: true }
  for (const condition of rule.conditions) {
    const spec = specOf(condition)
    const { key, label } = spec.subject(condition)
    const constraint = spec.constraint(condition)
    const previous = merged.constraints.get(key)
    merged.labels.set(key, label)
    if (!previous) {
      merged.constraints.set(key, constraint)
    } else if (sameConstraint(previous, constraint)) {
      merged.valid = false
      conflicts.push({ ruleIds: [rule.id], message: `La ${name} repite la condición sobre ${label}.` })
    } else if (previous.type === "interval" && constraint.type === "interval") {
      const both = intersect(previous, constraint)
      merged.constraints.set(key, both)
      if (isEmpty(both)) {
        merged.valid = false
        conflicts.push({ ruleIds: [rule.id], message: `La ${name} tiene condiciones opuestas sobre ${label}.` })
      }
    } else {
      merged.valid = false
      conflicts.push({ ruleIds: [rule.id], message: `La ${name} tiene condiciones opuestas sobre ${label}.` })
    }
  }
  return merged
}

/** Shared subjects if all of them can hold in both rules at once, else null. */
function overlap(a: Map<string, Constraint>, b: Map<string, Constraint>) {
  const shared = [...a.keys()].filter((key) => b.has(key))
  if (shared.length === 0) return null
  for (const key of shared) {
    const x = a.get(key)!
    const y = b.get(key)!
    if (x.type === "interval" && y.type === "interval") {
      if (isEmpty(intersect(x, y))) return null
    } else if (!sameConstraint(x, y)) {
      return null
    }
  }
  return shared
}

function sameConstraints(a: Map<string, Constraint>, b: Map<string, Constraint>) {
  return a.size === b.size && [...a].every(([key, c]) => b.has(key) && sameConstraint(c, b.get(key)!))
}

/**
 * Contradictions in a strategy:
 * - inside a rule (AND), conditions on the same subject that can't hold together, or repeated;
 * - a buy and a sell rule that look at the same subjects and can all hold at once (they could
 *   fire on the same candle). Rules over unrelated subjects are independent;
 * - two rules of the same side with equivalent conditions.
 */
export function findConflicts(rules: Rule[]): Conflict[] {
  const conflicts: Conflict[] = []
  const counters = { buy: 0, sell: 0 }
  const merged = rules.map((rule) => merge(rule, ruleName(rule.side, ++counters[rule.side]), conflicts))
  const valid = merged.filter((m) => m.valid)
  valid.forEach((a, i) => {
    for (const b of valid.slice(i + 1)) {
      if (a.rule.side === b.rule.side) {
        if (sameConstraints(a.constraints, b.constraints)) {
          conflicts.push({ ruleIds: [a.rule.id, b.rule.id], message: `La ${b.name} repite la ${a.name}.` })
        }
        continue
      }
      const shared = overlap(a.constraints, b.constraints)
      if (shared) {
        const labels = shared.map((key) => a.labels.get(key)).join(", ")
        conflicts.push({
          ruleIds: [a.rule.id, b.rule.id],
          message: `La ${a.name} y la ${b.name} se contradicen: pueden cumplirse a la vez sobre ${labels}.`,
        })
      }
    }
  })
  return conflicts
}

export function ruleName(side: RuleSide, position: number) {
  return `regla de ${side === "buy" ? "compra" : "venta"} ${position}`
}

export type StrategyErrors = {
  name?: string
  initialCapital?: string
  feePct?: string
  /** Strategy-level problems (no buy rule, too many rules). */
  general: string[]
  /** Per rule: size error, per-condition field errors and conflicts. */
  rules: Record<string, { size?: string; conditions: Record<string, string>[]; conflicts: string[] }>
}

/** Everything that blocks saving. `takenNames`: names of the user's other strategies. */
export function validateStrategy(draft: StrategyDraft, takenNames: string[]): StrategyErrors {
  const name = draft.name.trim()
  const result: StrategyErrors = { general: [], rules: {} }
  if (!name) result.name = "Escribe un nombre."
  else if (takenNames.some((taken) => taken.trim().toLowerCase() === name.toLowerCase()))
    result.name = "Ya tienes una estrategia con este nombre."
  if (!(draft.initialCapital > 0 && draft.initialCapital <= 1e9)) result.initialCapital = "Debe ser mayor que 0."
  if (!(draft.feePct >= 0 && draft.feePct <= 5)) result.feePct = "Entre 0 y 5 %."
  if (!draft.rules.some((r) => r.side === "buy")) result.general.push("Añade al menos una regla de compra.")
  if (draft.rules.length > MAX_RULES) result.general.push(`Como máximo ${MAX_RULES} reglas.`)

  for (const rule of draft.rules) {
    const { unit, value } = rule.size
    result.rules[rule.id] = {
      size: !(value > 0)
        ? "Debe ser mayor que 0."
        : unit === "pct" && value > 100
          ? "Como máximo 100 %."
          : undefined,
      conditions: rule.conditions.map((c) => specOf(c).validate(c)),
      conflicts: [],
    }
  }
  for (const conflict of findConflicts(draft.rules)) {
    for (const id of conflict.ruleIds) result.rules[id].conflicts.push(conflict.message)
  }
  return result
}

export function hasErrors(errors: StrategyErrors) {
  return (
    Boolean(errors.name || errors.initialCapital || errors.feePct) ||
    errors.general.length > 0 ||
    Object.values(errors.rules).some(
      (r) => r.size || r.conflicts.length > 0 || r.conditions.some((c) => Object.keys(c).length > 0)
    )
  )
}
