import type { Text } from "@/lib/i18n"

// Candlestick patterns available to the `candle-pattern` condition. Mirrors the detectors in the
// API's `app/strategies/patterns.py` (ids, bias and number of candles must match).

export type PatternBias = "bullish" | "bearish"

/** Open, high, low, close on a 0–100 scale (higher = higher price), oldest candle first. */
export type SchematicCandle = readonly [open: number, high: number, low: number, close: number]

export type CandlePattern = {
  /** Same id as the API's `PatternId`. */
  id: string
  name: Text
  bias: PatternBias
  /** What it means for the price. */
  description: Text
  /** Detection summary (see the API module for the exact tolerances). */
  rule: Text
  /** Idealized candles used by the illustration; the last one closes the pattern. */
  candles: readonly SchematicCandle[]
}

const patternList = [
  {
    id: "hammer",
    name: { es: "Martillo", en: "Hammer" },
    bias: "bullish",
    description: {
      es: "Tras una caída, los vendedores empujan el precio abajo pero los compradores lo devuelven arriba.",
      en: "After a decline, sellers push the price down but buyers drive it back up.",
    },
    rule: {
      es: "Mecha inferior ≥ 2× el cuerpo (y ≥ 60 % del rango), casi sin mecha superior, tras una caída.",
      en: "Lower wick ≥ 2× the body (and ≥ 60% of the range), almost no upper wick, after a decline.",
    },
    candles: [[60, 69, 25, 67]],
  },
  {
    id: "bullish-engulfing",
    name: { es: "Envolvente alcista", en: "Bullish engulfing" },
    bias: "bullish",
    description: {
      es: "Una vela alcista grande envuelve el cuerpo de la bajista anterior: los compradores toman el control.",
      en: "A large bullish candle engulfs the body of the previous bearish one: buyers take control.",
    },
    rule: {
      es: "Vela bajista seguida de una alcista que abre ≤ su cierre, cierra ≥ su apertura y tiene mayor cuerpo.",
      en: "A bearish candle followed by a bullish one that opens ≤ its close, closes ≥ its open and has a bigger body.",
    },
    candles: [[70, 72, 58, 60], [56, 80, 54, 78]],
  },
  {
    id: "morning-star",
    name: { es: "Estrella de la mañana", en: "Morning star" },
    bias: "bullish",
    description: {
      es: "Caída fuerte, indecisión y un rebote que recupera más de la mitad: posible suelo.",
      en: "A strong drop, indecision and a rebound that recovers more than half: a possible bottom.",
    },
    rule: {
      es: "Vela bajista larga, vela pequeña (≤ 50 % del cuerpo) bajo su cierre y alcista que cierra sobre la mitad de la primera.",
      en: "A long bearish candle, a small one (≤ 50% of the body) below its close and a bullish one closing above the middle of the first.",
    },
    candles: [[85, 87, 50, 52], [46, 50, 42, 48], [50, 82, 48, 80]],
  },
  {
    id: "piercing-line",
    name: { es: "Línea penetrante", en: "Piercing line" },
    bias: "bullish",
    description: {
      es: "Tras una vela bajista, la alcista abre abajo y cierra sobre la mitad de su cuerpo.",
      en: "After a bearish candle, the bullish one opens lower and closes above the middle of its body.",
    },
    rule: {
      es: "Bajista larga y alcista que abre ≤ su cierre y cierra entre la mitad y la apertura de la primera.",
      en: "A long bearish candle and a bullish one that opens ≤ its close and closes between the middle and the open of the first.",
    },
    candles: [[85, 87, 50, 52], [45, 78, 43, 76]],
  },
  {
    id: "three-white-soldiers",
    name: { es: "Tres soldados blancos", en: "Three white soldiers" },
    bias: "bullish",
    description: {
      es: "Tres velas alcistas seguidas con cierres crecientes: fuerte presión compradora sostenida.",
      en: "Three bullish candles in a row with rising closes: strong, sustained buying pressure.",
    },
    rule: {
      es: "Tres alcistas de cuerpo largo, cada una abre dentro de la anterior, cierra más alto y apenas tiene mecha superior.",
      en: "Three long-bodied bullish candles, each opening within the previous one, closing higher and with barely any upper wick.",
    },
    candles: [[30, 50, 28, 48], [42, 66, 40, 64], [58, 82, 56, 80]],
  },
  {
    id: "shooting-star",
    name: { es: "Estrella fugaz", en: "Shooting star" },
    bias: "bearish",
    description: {
      es: "Tras una subida, el precio se dispara pero cierra cerca del mínimo: los vendedores rechazan el máximo.",
      en: "After a rally, the price spikes but closes near the low: sellers reject the high.",
    },
    rule: {
      es: "Mecha superior ≥ 2× el cuerpo (y ≥ 60 % del rango), casi sin mecha inferior, tras una subida.",
      en: "Upper wick ≥ 2× the body (and ≥ 60% of the range), almost no lower wick, after a rally.",
    },
    candles: [[46, 75, 38, 40]],
  },
  {
    id: "bearish-engulfing",
    name: { es: "Envolvente bajista", en: "Bearish engulfing" },
    bias: "bearish",
    description: {
      es: "Una vela bajista grande envuelve el cuerpo de la alcista anterior: los vendedores toman el control.",
      en: "A large bearish candle engulfs the body of the previous bullish one: sellers take control.",
    },
    rule: {
      es: "Vela alcista seguida de una bajista que abre ≥ su cierre, cierra ≤ su apertura y tiene mayor cuerpo.",
      en: "A bullish candle followed by a bearish one that opens ≥ its close, closes ≤ its open and has a bigger body.",
    },
    candles: [[40, 60, 38, 58], [62, 64, 32, 34]],
  },
  {
    id: "evening-star",
    name: { es: "Estrella de la tarde", en: "Evening star" },
    bias: "bearish",
    description: {
      es: "Subida fuerte, indecisión y una caída que devuelve más de la mitad: posible techo.",
      en: "A strong rally, indecision and a drop that gives back more than half: a possible top.",
    },
    rule: {
      es: "Vela alcista larga, vela pequeña (≤ 50 % del cuerpo) sobre su cierre y bajista que cierra bajo la mitad de la primera.",
      en: "A long bullish candle, a small one (≤ 50% of the body) above its close and a bearish one closing below the middle of the first.",
    },
    candles: [[20, 52, 18, 50], [54, 58, 52, 56], [52, 54, 22, 24]],
  },
  {
    id: "dark-cloud-cover",
    name: { es: "Nube oscura", en: "Dark cloud cover" },
    bias: "bearish",
    description: {
      es: "Tras una vela alcista, la bajista abre arriba y cierra bajo la mitad de su cuerpo.",
      en: "After a bullish candle, the bearish one opens higher and closes below the middle of its body.",
    },
    rule: {
      es: "Alcista larga y bajista que abre ≥ su cierre y cierra entre la apertura y la mitad de la primera.",
      en: "A long bullish candle and a bearish one that opens ≥ its close and closes between the open and the middle of the first.",
    },
    candles: [[20, 52, 18, 50], [56, 58, 30, 32]],
  },
  {
    id: "three-black-crows",
    name: { es: "Tres cuervos negros", en: "Three black crows" },
    bias: "bearish",
    description: {
      es: "Tres velas bajistas seguidas con cierres decrecientes: fuerte presión vendedora sostenida.",
      en: "Three bearish candles in a row with falling closes: strong, sustained selling pressure.",
    },
    rule: {
      es: "Tres bajistas de cuerpo largo, cada una abre dentro de la anterior, cierra más bajo y apenas tiene mecha inferior.",
      en: "Three long-bodied bearish candles, each opening within the previous one, closing lower and with barely any lower wick.",
    },
    candles: [[80, 82, 60, 62], [70, 72, 46, 48], [58, 60, 34, 36]],
  },
] as const satisfies readonly CandlePattern[]

export type PatternId = (typeof patternList)[number]["id"]

export const candlePatterns: readonly CandlePattern[] = patternList

export const patternById = Object.fromEntries(candlePatterns.map((p) => [p.id, p])) as Record<PatternId, CandlePattern>

export const biasLabel: Record<PatternBias, Text> = {
  bullish: { es: "Alcista", en: "Bullish" },
  bearish: { es: "Bajista", en: "Bearish" },
}
