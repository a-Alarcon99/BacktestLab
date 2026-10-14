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
  /** "Corto plazo". */
  horizonLabel: string
  /** Candle timeframe the parameters were chosen for. */
  timeframe: string
  /** Typical holding time. */
  holding: string
  summary: string
  /** Why the rules are built this way. */
  rationale: string[]
  /** Where it tends to fail. */
  risk: string
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

export const presetStrategies: Strategy[] = [shortTerm, mediumTerm, longTerm]

export const presetInfo: Record<string, PresetInfo> = {
  "preset-short": {
    horizon: "short",
    horizonLabel: "Corto plazo",
    timeframe: "1h o 4h",
    holding: "Horas a pocos días",
    summary: "Compra caídas extremas y vende el rebote. Reversión a la media con stop corto.",
    rationale: [
      "Exigir RSI < 30 y cierre bajo la banda inferior a la vez filtra falsas señales: solo entra cuando el precio está estadísticamente estirado.",
      "Sale al recuperar el RSI 55 o al tocar la banda superior, sin esperar un máximo: busca muchas operaciones pequeñas.",
      "El stop del 4 % desde la compra limita las caídas que no rebotan (tendencias bajistas fuertes).",
    ],
    risk: "Falla en tendencias bajistas sostenidas, donde el precio sigue cayendo con RSI bajo. Las comisiones pesan porque opera mucho.",
  },
  "preset-medium": {
    horizon: "medium",
    horizonLabel: "Medio plazo",
    timeframe: "4h o 1d",
    holding: "Semanas",
    summary: "Sigue tendencias de swing: entra en el cruce alcista de medias con momentum y sale al revertirse.",
    rationale: [
      "El cruce de la EMA 20 sobre la EMA 50 detecta cambios de tendencia de semanas; las EMA reaccionan antes que las SMA.",
      "RSI > 50 confirma que el momentum acompaña y evita cruces débiles en rangos laterales.",
      "Sale en el cruce contrario y un stop del 10 % corta las pérdidas si la tendencia no se desarrolla.",
    ],
    risk: "En mercados laterales encadena pequeñas pérdidas (cruces falsos). Entra y sale con retraso respecto a los extremos.",
  },
  "preset-long": {
    horizon: "long",
    horizonLabel: "Largo plazo",
    timeframe: "1d",
    holding: "Meses",
    summary: "Compra la ruptura del máximo de 100 velas y aguanta hasta perder el mínimo de 50: sigue las grandes tendencias.",
    rationale: [
      "Un máximo de 100 velas solo se rompe en tendencias importantes; pocas entradas, pero de alta convicción.",
      "La salida (mínimo de 50 velas) es más corta que la entrada: deja correr las ganancias y protege lo ganado.",
      "El stop del 25 % es solo una red de seguridad ante caídas bruscas; la salida normal es el canal.",
    ],
    risk: "Opera poco y tolera caídas profundas antes de salir; en mercados sin tendencia produce falsas rupturas.",
  },
}

export function isPreset(id: string) {
  return id in presetInfo
}

export function getPreset(id: string): Strategy | undefined {
  return presetStrategies.find((s) => s.id === id)
}
