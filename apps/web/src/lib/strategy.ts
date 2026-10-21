import type { RangePreset, Timeframe } from "@/lib/candles"
import { patternById, type PatternId } from "@/lib/candle-patterns"
import { defaultLocale, intlLocale, translator, type Locale, type Text, type Translate } from "@/lib/i18n"

// Strategy model shared by the form, the list and the backtest request. Mirrors the API's
// `app/schemas/backtest.py`; contradiction rules mirror `app/strategies/validation.py`.

export type RuleSide = "buy" | "sell"
/** UI families used to group condition kinds. */
export type RuleKind = "indicator" | "price" | "volume" | "periodic" | "pattern"

type Op = "above" | "below"
type Direction = "up" | "down"

/**
 * Second level of settings every condition shares (all optional, off when absent): the market
 * direction it needs (close above/below its EMA of `trendPeriod`, default 50) and how many candles
 * the signal stays active after it happens (default 1). Not applied to "price since the buy".
 */
export type ConditionOptions = { trend?: "up" | "down"; trendPeriod?: number; lasts?: number }
export const DEFAULT_TREND_PERIOD = 50

export type Condition = (
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
  /** Candlestick pattern completed by the closing candle (see `lib/candle-patterns.ts`). */
  | { kind: "candle-pattern"; pattern: PatternId }
) &
  ConditionOptions

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

const decimals: Record<Locale, Intl.NumberFormat> = {
  es: new Intl.NumberFormat(intlLocale.es, { maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat(intlLocale.en, { maximumFractionDigits: 2 }),
}
const num = (l: Locale, value: number) => decimals[l].format(value)

type Interval = { type: "interval"; lo: number; hi: number }
type Choice = { type: "choice"; value: string }
type Constraint = Interval | Choice

const interval = (lo: number, hi: number): Interval => ({ type: "interval", lo, hi })
const choice = (value: string): Choice => ({ type: "choice", value })
const threshold = (op: Op, value: number) => (op === "above" ? interval(value, Infinity) : interval(-Infinity, value))

// Every text-producing function takes the UI language (`l`, Spanish by default).
type ConditionSpec<C extends Condition> = {
  /** Name in the condition picker. */
  name: Text
  family: RuleKind
  defaults: (side: RuleSide) => C
  describe: (c: C, l?: Locale) => string
  /** What the condition looks at: same subject = comparable (see `findConflicts`). */
  subject: (c: C, l?: Locale) => { key: string; label: string }
  constraint: (c: C) => Constraint
  /** Per-field errors, keyed by field name. */
  validate: (c: C, l?: Locale) => Record<string, string>
}

const periodError = (t: Translate, value: number) =>
  Number.isInteger(value) && value >= 2 && value <= 200 ? undefined : t("Entero entre 2 y 200", "Whole number from 2 to 200")

const slowError = (t: Translate, fast: number, slow: number) =>
  periodError(t, slow) ?? (fast >= slow && t("Debe ser mayor que la rápida", "Must be greater than the fast one"))

function errors(entries: Record<string, string | undefined | false>) {
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v)) as Record<string, string>
}

/** Labels of the periodic condition's frequencies (also its picker options). */
export const periodicLabel: Record<"day" | "week" | "month", Text> = {
  day: { es: "Cada día", en: "Every day" },
  week: { es: "Cada semana (lunes)", en: "Every week (Monday)" },
  month: { es: "Cada mes (día 1)", en: "Every month (1st)" },
}

/**
 * Registry of condition kinds. Adding one = an entry here, its fields in the strategy form and
 * its counterpart in the API (`app/strategies/conditions.py`).
 */
export const conditionSpecs: { [K in ConditionKind]: ConditionSpec<ConditionOf<K>> } = {
  rsi: {
    name: { es: "RSI", en: "RSI" },
    family: "indicator",
    defaults: (side) => ({ kind: "rsi", period: 14, op: side === "buy" ? "below" : "above", value: side === "buy" ? 30 : 70 }),
    describe: (c, l = defaultLocale) => {
      const t = translator(l)
      return `RSI (${c.period}) ${c.op === "above" ? t("por encima de", "above") : t("por debajo de", "below")} ${num(l, c.value)}`
    },
    subject: (c) => ({ key: `rsi:${c.period}`, label: `RSI (${c.period})` }),
    constraint: (c) => threshold(c.op, c.value),
    validate: (c, l = defaultLocale) => {
      const t = translator(l)
      return errors({ period: periodError(t, c.period), value: !(c.value > 0 && c.value < 100) && t("Entre 0 y 100", "Between 0 and 100") })
    },
  },
  "ma-cross": {
    name: { es: "Cruce de medias", en: "Moving average cross" },
    family: "indicator",
    defaults: (side) => ({ kind: "ma-cross", ma: "sma", fast: 20, slow: 50, direction: side === "buy" ? "up" : "down" }),
    describe: (c, l = defaultLocale) => {
      const ma = c.ma.toUpperCase()
      return l === "en"
        ? `${ma} ${c.fast} crosses ${c.direction === "up" ? "above" : "below"} the ${ma} ${c.slow}`
        : `${ma} ${c.fast} cruza ${c.direction === "up" ? "al alza" : "a la baja"} la ${ma} ${c.slow}`
    },
    subject: (c, l = defaultLocale) => ({
      key: `${c.ma}-cross:${c.fast}:${c.slow}`,
      label: `${translator(l)("cruce", "the cross")} ${c.ma.toUpperCase()} ${c.fast}/${c.slow}`,
    }),
    constraint: (c) => choice(c.direction),
    validate: (c, l = defaultLocale) => {
      const t = translator(l)
      return errors({ fast: periodError(t, c.fast), slow: slowError(t, c.fast, c.slow) })
    },
  },
  macd: {
    name: { es: "MACD", en: "MACD" },
    family: "indicator",
    defaults: (side) => ({ kind: "macd", fast: 12, slow: 26, signal: 9, direction: side === "buy" ? "up" : "down" }),
    describe: (c, l = defaultLocale) =>
      l === "en"
        ? `MACD (${c.fast}, ${c.slow}, ${c.signal}) crosses ${c.direction === "up" ? "above" : "below"} its signal`
        : `MACD (${c.fast}, ${c.slow}, ${c.signal}) cruza ${c.direction === "up" ? "al alza" : "a la baja"} su señal`,
    subject: (c) => ({ key: `macd:${c.fast}:${c.slow}:${c.signal}`, label: `MACD (${c.fast}, ${c.slow}, ${c.signal})` }),
    constraint: (c) => choice(c.direction),
    validate: (c, l = defaultLocale) => {
      const t = translator(l)
      return errors({ fast: periodError(t, c.fast), slow: slowError(t, c.fast, c.slow), signal: periodError(t, c.signal) })
    },
  },
  bollinger: {
    name: { es: "Bandas de Bollinger", en: "Bollinger Bands" },
    family: "indicator",
    defaults: (side) => ({ kind: "bollinger", period: 20, stdDev: 2, band: side === "buy" ? "lower" : "upper" }),
    describe: (c, l = defaultLocale) =>
      l === "en"
        ? `Close ${c.band === "upper" ? "above the upper" : "below the lower"} Bollinger Band (${c.period}, ${num(l, c.stdDev)})`
        : `Cierre ${c.band === "upper" ? "por encima de la banda superior" : "por debajo de la banda inferior"} de Bollinger (${c.period}, ${num(l, c.stdDev)})`,
    subject: (c, l = defaultLocale) => ({
      key: `bollinger:${c.period}:${c.stdDev}`,
      label: `Bollinger (${c.period}, ${num(l, c.stdDev)})`,
    }),
    constraint: (c) => choice(c.band),
    validate: (c, l = defaultLocale) => {
      const t = translator(l)
      return errors({
        period: periodError(t, c.period),
        stdDev: !(c.stdDev >= 0.5 && c.stdDev <= 5) && t("Entre 0,5 y 5", "Between 0.5 and 5"),
      })
    },
  },
  donchian: {
    name: { es: "Canal Donchian", en: "Donchian Channel" },
    family: "indicator",
    defaults: (side) => ({ kind: "donchian", period: 20, direction: side === "buy" ? "up" : "down" }),
    describe: (c, l = defaultLocale) =>
      l === "en"
        ? `Close breaks the ${c.direction === "up" ? "high" : "low"} of the last ${c.period} candles`
        : `El cierre rompe el ${c.direction === "up" ? "máximo" : "mínimo"} de las últimas ${c.period} velas`,
    subject: (c) => ({ key: `donchian:${c.period}`, label: `Donchian (${c.period})` }),
    constraint: (c) => choice(c.direction),
    validate: (c, l = defaultLocale) => errors({ period: periodError(translator(l), c.period) }),
  },
  "price-change": {
    name: { es: "Variación de precio", en: "Price change" },
    family: "price",
    defaults: (side) =>
      side === "buy"
        ? { kind: "price-change", direction: "down", pct: 5, lookback: 24 }
        : { kind: "price-change", direction: "up", pct: 10, lookback: "entry" },
    describe: (c, l = defaultLocale) => {
      const pct = num(l, c.pct)
      if (l === "en") {
        const window = c.lookback === "entry" ? "since the buy" : `in ${c.lookback} ${c.lookback === 1 ? "candle" : "candles"}`
        return `Price ${c.direction === "up" ? "rises" : "falls"} more than ${pct}% ${window}`
      }
      const window = c.lookback === "entry" ? "desde la compra" : `en ${c.lookback} ${c.lookback === 1 ? "vela" : "velas"}`
      return `El precio ${c.direction === "up" ? "sube" : "cae"} más de un ${pct} % ${window}`
    },
    subject: (c, l = defaultLocale) => {
      const t = translator(l)
      return {
        key: `price-change:${c.lookback}`,
        label:
          c.lookback === "entry"
            ? t("el precio desde la compra", "the price since the buy")
            : t(`el precio en ${c.lookback} velas`, `the price over ${c.lookback} candles`),
      }
    },
    constraint: (c) => (c.direction === "up" ? interval(c.pct, Infinity) : interval(-Infinity, -c.pct)),
    validate: (c, l = defaultLocale) => {
      const t = translator(l)
      return errors({
        pct: !(c.pct > 0 && c.pct <= 1000) && t("Entre 0 y 1000", "Between 0 and 1000"),
        lookback:
          c.lookback !== "entry" &&
          !(Number.isInteger(c.lookback) && c.lookback >= 1 && c.lookback <= 200) &&
          t("Entero entre 1 y 200", "Whole number from 1 to 200"),
      })
    },
  },
  volume: {
    name: { es: "Volumen", en: "Volume" },
    family: "volume",
    defaults: () => ({ kind: "volume", op: "above", multiple: 1.5, period: 20 }),
    describe: (c, l = defaultLocale) =>
      l === "en"
        ? `Volume ${c.op === "above" ? "above" : "below"} ${num(l, c.multiple)}× its ${c.period}-candle average`
        : `Volumen ${c.op === "above" ? "por encima de" : "por debajo de"} ${num(l, c.multiple)}× su media de ${c.period} velas`,
    subject: (c, l = defaultLocale) => ({
      key: `volume:${c.period}`,
      label: translator(l)(`el volumen (media ${c.period})`, `the volume (${c.period} average)`),
    }),
    constraint: (c) => threshold(c.op, c.multiple),
    validate: (c, l = defaultLocale) => {
      const t = translator(l)
      return errors({
        multiple: !(c.multiple > 0 && c.multiple <= 100) && t("Entre 0 y 100", "Between 0 and 100"),
        period: periodError(t, c.period),
      })
    },
  },
  periodic: {
    name: { es: "Periódica", en: "Periodic" },
    family: "periodic",
    defaults: () => ({ kind: "periodic", every: "week" }),
    describe: (c, l = defaultLocale) => periodicLabel[c.every][l],
    subject: (c, l = defaultLocale) => ({
      key: `periodic:${c.every}`,
      label: translator(l)("la misma frecuencia", "the same frequency"),
    }),
    constraint: () => choice("on"),
    validate: () => ({}),
  },
  "candle-pattern": {
    name: { es: "Patrón de velas", en: "Candlestick pattern" },
    family: "pattern",
    defaults: (side) => ({ kind: "candle-pattern", pattern: side === "buy" ? "hammer" : "shooting-star" }),
    describe: (c, l = defaultLocale) => {
      const pattern = patternById[c.pattern]
      const bullish = pattern.bias === "bullish"
      return l === "en"
        ? `${pattern.name.en} pattern forms (${bullish ? "bullish" : "bearish"})`
        : `Se forma el patrón ${pattern.name.es} (${bullish ? "alcista" : "bajista"})`
    },
    // One subject per pattern: different patterns may co-occur, the same one in a buy and a sell
    // rule would fire together.
    subject: (c, l = defaultLocale) => ({
      key: `candle-pattern:${c.pattern}`,
      label: translator(l)(`el patrón ${patternById[c.pattern].name.es}`, `the ${patternById[c.pattern].name.en} pattern`),
    }),
    constraint: () => choice("on"),
    validate: (c, l = defaultLocale) =>
      errors({ pattern: !(c.pattern in patternById) && translator(l)("Elige un patrón", "Pick a pattern") }),
  },
}

export const conditionKinds = Object.keys(conditionSpecs) as ConditionKind[]

/** The options do not apply to a condition on the price since the buy (the engine checks it order by order). */
export const takesOptions = (c: Condition) => !(c.kind === "price-change" && c.lookback === "entry")

function optionsKey(c: Condition) {
  if (!takesOptions(c)) return ""
  return (c.trend ? `:trend-${c.trend}-${c.trendPeriod ?? DEFAULT_TREND_PERIOD}` : "") + (c.lasts && c.lasts > 1 ? `:lasts-${c.lasts}` : "")
}

function optionsText(c: Condition, l: Locale) {
  if (!takesOptions(c)) return ""
  const parts: string[] = []
  if (c.trend) {
    const ema = `EMA ${c.trendPeriod ?? DEFAULT_TREND_PERIOD}`
    parts.push(l === "en" ? `${c.trend === "up" ? "rising" : "falling"} market (${ema})` : `mercado ${c.trend === "up" ? "alcista" : "bajista"} (${ema})`)
  }
  if (c.lasts && c.lasts > 1) parts.push(l === "en" ? `signal active ${c.lasts} candles` : `señal activa ${c.lasts} velas`)
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : ""
}

function optionErrors(c: Condition, l: Locale) {
  if (!takesOptions(c)) return {}
  const t = translator(l)
  return errors({
    trend: c.trend !== undefined && c.trend !== "up" && c.trend !== "down" && t("Dirección no válida", "Invalid direction"),
    trendPeriod:
      c.trend !== undefined &&
      !(Number.isInteger(c.trendPeriod ?? DEFAULT_TREND_PERIOD) && (c.trendPeriod ?? DEFAULT_TREND_PERIOD) >= 2 && (c.trendPeriod ?? DEFAULT_TREND_PERIOD) <= 400) &&
      t("Entero entre 2 y 400", "Whole number from 2 to 400"),
    lasts: c.lasts !== undefined && !(Number.isInteger(c.lasts) && c.lasts >= 1 && c.lasts <= 50) && t("Entero entre 1 y 50", "Whole number from 1 to 50"),
  })
}

/**
 * The registry entry of a condition, typed for the union, with the shared options folded in: they
 * show in its description, make its subject different (so differently configured conditions are not
 * compared as contradictory) and are validated.
 */
export function specOf(condition: Condition): ConditionSpec<Condition> {
  const base = conditionSpecs[condition.kind] as unknown as ConditionSpec<Condition>
  return {
    ...base,
    describe: (c, l = defaultLocale) => base.describe(c, l) + optionsText(c, l),
    subject: (c, l = defaultLocale) => {
      const subject = base.subject(c, l)
      return { ...subject, key: subject.key + optionsKey(c) }
    },
    validate: (c, l = defaultLocale) => ({ ...base.validate(c, l), ...optionErrors(c, l) }),
  }
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

export function describeSize(rule: Rule, l: Locale = defaultLocale) {
  const value = num(l, rule.size.value)
  if (l === "en") {
    if (rule.side === "sell") return `sell ${value}% of the position`
    return rule.size.unit === "usdt" ? `buy ${value} USDT` : `buy ${value}% of the cash`
  }
  if (rule.side === "sell") return `vender ${value} % de la posición`
  return rule.size.unit === "usdt" ? `comprar ${value} USDT` : `comprar ${value} % del efectivo`
}

/** Conditions of a rule joined with "y" / "and" (only the first one capitalized). */
export function describeConditions(rule: Rule, l: Locale = defaultLocale) {
  return rule.conditions
    .map((c) => specOf(c).describe(c, l))
    .map((c, i) => (i === 0 ? c : c.charAt(0).toLowerCase() + c.slice(1)))
    .join(translator(l)(" y ", " and "))
}

/** Human-readable rule: "RSI (14) por debajo de 30 y … → comprar 50 % del efectivo". */
export function describeRule(rule: Rule, l: Locale = defaultLocale) {
  return `${describeConditions(rule, l)} → ${describeSize(rule, l)}`
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

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function merge(rule: Rule, name: string, conflicts: Conflict[], l: Locale): MergedRule {
  const t = translator(l)
  const opposite = (label: string) =>
    t(`La ${name} tiene condiciones opuestas sobre ${label}.`, `${cap(name)} has opposite conditions on ${label}.`)
  const merged: MergedRule = { rule, name, constraints: new Map(), labels: new Map(), valid: true }
  for (const condition of rule.conditions) {
    const spec = specOf(condition)
    const { key, label } = spec.subject(condition, l)
    const constraint = spec.constraint(condition)
    const previous = merged.constraints.get(key)
    merged.labels.set(key, label)
    if (!previous) {
      merged.constraints.set(key, constraint)
    } else if (sameConstraint(previous, constraint)) {
      merged.valid = false
      conflicts.push({
        ruleIds: [rule.id],
        message: t(`La ${name} repite la condición sobre ${label}.`, `${cap(name)} repeats the condition on ${label}.`),
      })
    } else if (previous.type === "interval" && constraint.type === "interval") {
      const both = intersect(previous, constraint)
      merged.constraints.set(key, both)
      if (isEmpty(both)) {
        merged.valid = false
        conflicts.push({ ruleIds: [rule.id], message: opposite(label) })
      }
    } else {
      merged.valid = false
      conflicts.push({ ruleIds: [rule.id], message: opposite(label) })
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
export function findConflicts(rules: Rule[], l: Locale = defaultLocale): Conflict[] {
  const t = translator(l)
  const conflicts: Conflict[] = []
  const counters = { buy: 0, sell: 0 }
  const merged = rules.map((rule) => merge(rule, ruleName(rule.side, ++counters[rule.side], l), conflicts, l))
  const valid = merged.filter((m) => m.valid)
  valid.forEach((a, i) => {
    for (const b of valid.slice(i + 1)) {
      if (a.rule.side === b.rule.side) {
        if (sameConstraints(a.constraints, b.constraints)) {
          conflicts.push({
            ruleIds: [a.rule.id, b.rule.id],
            message: t(`La ${b.name} repite la ${a.name}.`, `${cap(b.name)} repeats ${a.name}.`),
          })
        }
        continue
      }
      const shared = overlap(a.constraints, b.constraints)
      if (shared) {
        const labels = shared.map((key) => a.labels.get(key)).join(", ")
        conflicts.push({
          ruleIds: [a.rule.id, b.rule.id],
          message: t(
            `La ${a.name} y la ${b.name} se contradicen: pueden cumplirse a la vez sobre ${labels}.`,
            `${cap(a.name)} and ${b.name} contradict each other: both can hold at once on ${labels}.`
          ),
        })
      }
    }
  })
  return conflicts
}

export function ruleName(side: RuleSide, position: number, l: Locale = defaultLocale) {
  return l === "en"
    ? `${side === "buy" ? "buy" : "sell"} rule ${position}`
    : `regla de ${side === "buy" ? "compra" : "venta"} ${position}`
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
export function validateStrategy(draft: StrategyDraft, takenNames: string[], l: Locale = defaultLocale): StrategyErrors {
  const t = translator(l)
  const name = draft.name.trim()
  const result: StrategyErrors = { general: [], rules: {} }
  if (!name) result.name = t("Escribe un nombre.", "Enter a name.")
  else if (takenNames.some((taken) => taken.trim().toLowerCase() === name.toLowerCase()))
    result.name = t("Ya tienes una estrategia con este nombre.", "You already have a strategy with this name.")
  if (!(draft.initialCapital > 0 && draft.initialCapital <= 1e9))
    result.initialCapital = t("Debe ser mayor que 0.", "Must be greater than 0.")
  if (!(draft.feePct >= 0 && draft.feePct <= 5)) result.feePct = t("Entre 0 y 5 %.", "Between 0 and 5%.")
  if (!draft.rules.some((r) => r.side === "buy"))
    result.general.push(t("Añade al menos una regla de compra.", "Add at least one buy rule."))
  if (draft.rules.length > MAX_RULES) result.general.push(t(`Como máximo ${MAX_RULES} reglas.`, `At most ${MAX_RULES} rules.`))

  for (const rule of draft.rules) {
    const { unit, value } = rule.size
    result.rules[rule.id] = {
      size: !(value > 0)
        ? t("Debe ser mayor que 0.", "Must be greater than 0.")
        : unit === "pct" && value > 100
          ? t("Como máximo 100 %.", "At most 100%.")
          : undefined,
      conditions: rule.conditions.map((c) => specOf(c).validate(c, l)),
      conflicts: [],
    }
  }
  for (const conflict of findConflicts(draft.rules, l)) {
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
