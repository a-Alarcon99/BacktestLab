import { defaultLocale, locales, type Locale, type Text } from "@/lib/i18n"
import type { Rule, Strategy } from "@/lib/strategy"

// Built-in strategies: read-only, shipped with the app (never stored in the browser). They use the
// regular `Strategy` shape so they run through the same backtest path as the user's own.
//
// Engine facts they rely on: sells are checked before buys, one order per candle, a 100 % buy
// leaves no cash (so a signal that keeps holding cannot pyramid), and a partial sell on a *state*
// condition would repeat every candle, so every exit here closes the whole position.

export type PresetHorizon = "short" | "medium" | "long"

export type PresetInfo = {
  horizon: PresetHorizon
  /** Name shown in each language (the `Strategy.name` below is the Spanish one). */
  name: Text
  /** "Corto plazo". */
  horizonLabel: Text
  /** Candle timeframe the parameters were chosen for. */
  timeframe: Text
  /** Typical holding time. */
  holding: Text
  summary: Text
  /** Why the rules are built this way. */
  rationale: Text[]
  /** Where it tends to fail. */
  risk: Text
}

const CREATED = "2026-01-01T00:00:00.000Z"

function rule(id: string, side: Rule["side"], conditions: Rule["conditions"], size: Rule["size"]): Rule {
  return { id, side, conditions, size }
}

const all = { unit: "pct", value: 100 } as const

const shortTerm: Strategy = {
  schemaVersion: 1,
  id: "preset-short",
  name: "Rebote RSI + Bollinger",
  recommendedTimeframe: "4h",
  recommendedRange: "6M",
  initialCapital: 10_000,
  feePct: 0.1,
  createdAt: CREATED,
  updatedAt: CREATED,
  rules: [
    rule(
      "short-buy",
      "buy",
      [
        { kind: "rsi", period: 14, op: "below", value: 30 },
        { kind: "bollinger", period: 20, stdDev: 2, band: "lower" },
      ],
      all
    ),
    rule("short-sell-rsi", "sell", [{ kind: "rsi", period: 14, op: "above", value: 55 }], all),
    rule("short-sell-band", "sell", [{ kind: "bollinger", period: 20, stdDev: 2, band: "upper" }], all),
    rule("short-sell-stop", "sell", [{ kind: "price-change", direction: "down", pct: 4, lookback: "entry" }], all),
  ],
}

const mediumTerm: Strategy = {
  schemaVersion: 1,
  id: "preset-medium",
  name: "Tendencia EMA 20/50",
  recommendedTimeframe: "1d",
  recommendedRange: "1A",
  initialCapital: 10_000,
  feePct: 0.1,
  createdAt: CREATED,
  updatedAt: CREATED,
  rules: [
    rule(
      "medium-buy",
      "buy",
      [
        { kind: "ma-cross", ma: "ema", fast: 20, slow: 50, direction: "up" },
        { kind: "rsi", period: 14, op: "above", value: 50 },
      ],
      all
    ),
    rule("medium-sell-cross", "sell", [{ kind: "ma-cross", ma: "ema", fast: 20, slow: 50, direction: "down" }], all),
    rule("medium-sell-stop", "sell", [{ kind: "price-change", direction: "down", pct: 10, lookback: "entry" }], all),
  ],
}

const longTerm: Strategy = {
  schemaVersion: 1,
  id: "preset-long",
  name: "Ruptura Donchian 100/50",
  recommendedTimeframe: "1d",
  recommendedRange: "3A",
  initialCapital: 10_000,
  feePct: 0.1,
  createdAt: CREATED,
  updatedAt: CREATED,
  rules: [
    rule("long-buy", "buy", [{ kind: "donchian", period: 100, direction: "up" }], all),
    rule("long-sell-channel", "sell", [{ kind: "donchian", period: 50, direction: "down" }], all),
    rule("long-sell-stop", "sell", [{ kind: "price-change", direction: "down", pct: 25, lookback: "entry" }], all),
  ],
}

export const presetInfo: Record<string, PresetInfo> = {
  "preset-short": {
    horizon: "short",
    name: { es: "Rebote RSI + Bollinger", en: "RSI + Bollinger Rebound" },
    horizonLabel: { es: "Corto plazo", en: "Short term" },
    timeframe: { es: "1h o 4h", en: "1h or 4h" },
    holding: { es: "Horas a pocos días", en: "Hours to a few days" },
    summary: {
      es: "Compra caídas extremas y vende el rebote. Reversión a la media con stop corto.",
      en: "Buys extreme dips and sells the rebound. Mean reversion with a tight stop.",
    },
    rationale: [
      {
        es: "Exigir RSI < 30 y cierre bajo la banda inferior a la vez filtra falsas señales: solo entra cuando el precio está estadísticamente estirado.",
        en: "Requiring RSI < 30 and a close below the lower band at the same time filters out false signals: it only enters when the price is statistically stretched.",
      },
      {
        es: "Sale al recuperar el RSI 55 o al tocar la banda superior, sin esperar un máximo: busca muchas operaciones pequeñas.",
        en: "It exits when RSI gets back to 55 or the price touches the upper band, without waiting for a top: it aims for many small trades.",
      },
      {
        es: "El stop del 4 % desde la compra limita las caídas que no rebotan (tendencias bajistas fuertes).",
        en: "The 4% stop from the buy price limits the drops that don't bounce (strong downtrends).",
      },
    ],
    risk: {
      es: "Falla en tendencias bajistas sostenidas, donde el precio sigue cayendo con RSI bajo. Las comisiones pesan porque opera mucho.",
      en: "It fails in sustained downtrends, where the price keeps falling with a low RSI. Fees add up because it trades a lot.",
    },
  },
  "preset-medium": {
    horizon: "medium",
    name: { es: "Tendencia EMA 20/50", en: "EMA 20/50 Trend" },
    horizonLabel: { es: "Medio plazo", en: "Medium term" },
    timeframe: { es: "4h o 1d", en: "4h or 1d" },
    holding: { es: "Semanas", en: "Weeks" },
    summary: {
      es: "Sigue tendencias de swing: entra en el cruce alcista de medias con momentum y sale al revertirse.",
      en: "Follows swing trends: enters on the bullish moving average cross with momentum and exits when it reverses.",
    },
    rationale: [
      {
        es: "El cruce de la EMA 20 sobre la EMA 50 detecta cambios de tendencia de semanas; las EMA reaccionan antes que las SMA.",
        en: "The EMA 20 crossing above the EMA 50 detects trend changes lasting weeks; EMAs react faster than SMAs.",
      },
      {
        es: "RSI > 50 confirma que el momentum acompaña y evita cruces débiles en rangos laterales.",
        en: "RSI > 50 confirms that momentum agrees and avoids weak crosses in sideways ranges.",
      },
      {
        es: "Sale en el cruce contrario y un stop del 10 % corta las pérdidas si la tendencia no se desarrolla.",
        en: "It exits on the opposite cross, and a 10% stop cuts losses if the trend doesn't develop.",
      },
    ],
    risk: {
      es: "En mercados laterales encadena pequeñas pérdidas (cruces falsos). Entra y sale con retraso respecto a los extremos.",
      en: "In sideways markets it strings together small losses (false crosses). It enters and exits late relative to the extremes.",
    },
  },
  "preset-long": {
    horizon: "long",
    name: { es: "Ruptura Donchian 100/50", en: "Donchian 100/50 Breakout" },
    horizonLabel: { es: "Largo plazo", en: "Long term" },
    timeframe: { es: "1d", en: "1d" },
    holding: { es: "Meses", en: "Months" },
    summary: {
      es: "Compra la ruptura del máximo de 100 velas y aguanta hasta perder el mínimo de 50: sigue las grandes tendencias.",
      en: "Buys the breakout of the 100-candle high and holds until the 50-candle low is lost: it rides the big trends.",
    },
    rationale: [
      {
        es: "Un máximo de 100 velas solo se rompe en tendencias importantes; pocas entradas, pero de alta convicción.",
        en: "A 100-candle high only breaks in major trends: few entries, but high-conviction ones.",
      },
      {
        es: "La salida (mínimo de 50 velas) es más corta que la entrada: deja correr las ganancias y protege lo ganado.",
        en: "The exit (50-candle low) is shorter than the entry: it lets profits run and protects the gains.",
      },
      {
        es: "El stop del 25 % es solo una red de seguridad ante caídas bruscas; la salida normal es el canal.",
        en: "The 25% stop is only a safety net against sudden crashes; the normal exit is the channel.",
      },
    ],
    risk: {
      es: "Opera poco y tolera caídas profundas antes de salir; en mercados sin tendencia produce falsas rupturas.",
      en: "It trades rarely and tolerates deep drops before exiting; in trendless markets it produces false breakouts.",
    },
  },
}

const presetList: Strategy[] = [shortTerm, mediumTerm, longTerm]

/** The presets with their names in `locale` (the rules are the same in every language). */
export function presetStrategiesFor(locale: Locale): Strategy[] {
  return presetList.map((s) => ({ ...s, name: presetInfo[s.id].name[locale] }))
}

/** Spanish presets. */
export const presetStrategies: Strategy[] = presetStrategiesFor(defaultLocale)

/** Names of the presets in every language: no user strategy may take any of them. */
export const presetNames: string[] = locales.flatMap((l) => presetStrategiesFor(l).map((s) => s.name))

export function isPreset(id: string) {
  return id in presetInfo
}

export function getPreset(id: string, locale: Locale = defaultLocale): Strategy | undefined {
  return presetStrategiesFor(locale).find((s) => s.id === id)
}

