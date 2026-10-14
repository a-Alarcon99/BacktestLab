// Candlestick patterns available to the `candle-pattern` condition. Mirrors the detectors in the
// API's `app/strategies/patterns.py` (ids, bias and number of candles must match).

export type PatternBias = "bullish" | "bearish"

/** Open, high, low, close on a 0–100 scale (higher = higher price), oldest candle first. */
export type SchematicCandle = readonly [open: number, high: number, low: number, close: number]

export type CandlePattern = {
  /** Same id as the API's `PatternId`. */
  id: string
  name: string
  bias: PatternBias
  /** What it means for the price. */
  description: string
  /** Detection summary (see the API module for the exact tolerances). */
  rule: string
  /** Idealized candles used by the illustration; the last one closes the pattern. */
  candles: readonly SchematicCandle[]
}

const patternList = [
  {
    id: "hammer",
    name: "Martillo",
    bias: "bullish",
    description: "Tras una caída, los vendedores empujan el precio abajo pero los compradores lo devuelven arriba.",
    rule: "Mecha inferior ≥ 2× el cuerpo (y ≥ 60 % del rango), casi sin mecha superior, tras una caída.",
    candles: [[60, 69, 25, 67]],
  },
  {
    id: "bullish-engulfing",
    name: "Envolvente alcista",
    bias: "bullish",
    description: "Una vela alcista grande envuelve el cuerpo de la bajista anterior: los compradores toman el control.",
    rule: "Vela bajista seguida de una alcista que abre ≤ su cierre, cierra ≥ su apertura y tiene mayor cuerpo.",
    candles: [[70, 72, 58, 60], [56, 80, 54, 78]],
  },
  {
    id: "morning-star",
    name: "Estrella de la mañana",
    bias: "bullish",
    description: "Caída fuerte, indecisión y un rebote que recupera más de la mitad: posible suelo.",
    rule: "Vela bajista larga, vela pequeña (≤ 50 % del cuerpo) bajo su cierre y alcista que cierra sobre la mitad de la primera.",
    candles: [[85, 87, 50, 52], [46, 50, 42, 48], [50, 82, 48, 80]],
  },
  {
    id: "piercing-line",
    name: "Línea penetrante",
    bias: "bullish",
    description: "Tras una vela bajista, la alcista abre abajo y cierra sobre la mitad de su cuerpo.",
    rule: "Bajista larga y alcista que abre ≤ su cierre y cierra entre la mitad y la apertura de la primera.",
    candles: [[85, 87, 50, 52], [45, 78, 43, 76]],
  },
  {
    id: "three-white-soldiers",
    name: "Tres soldados blancos",
    bias: "bullish",
    description: "Tres velas alcistas seguidas con cierres crecientes: fuerte presión compradora sostenida.",
    rule: "Tres alcistas de cuerpo largo, cada una abre dentro de la anterior, cierra más alto y apenas tiene mecha superior.",
    candles: [[30, 50, 28, 48], [42, 66, 40, 64], [58, 82, 56, 80]],
  },
  {
    id: "shooting-star",
    name: "Estrella fugaz",
    bias: "bearish",
    description: "Tras una subida, el precio se dispara pero cierra cerca del mínimo: los vendedores rechazan el máximo.",
    rule: "Mecha superior ≥ 2× el cuerpo (y ≥ 60 % del rango), casi sin mecha inferior, tras una subida.",
    candles: [[46, 75, 38, 40]],
  },
  {
    id: "bearish-engulfing",
    name: "Envolvente bajista",
    bias: "bearish",
    description: "Una vela bajista grande envuelve el cuerpo de la alcista anterior: los vendedores toman el control.",
    rule: "Vela alcista seguida de una bajista que abre ≥ su cierre, cierra ≤ su apertura y tiene mayor cuerpo.",
    candles: [[40, 60, 38, 58], [62, 64, 32, 34]],
  },
  {
    id: "evening-star",
    name: "Estrella de la tarde",
    bias: "bearish",
    description: "Subida fuerte, indecisión y una caída que devuelve más de la mitad: posible techo.",
    rule: "Vela alcista larga, vela pequeña (≤ 50 % del cuerpo) sobre su cierre y bajista que cierra bajo la mitad de la primera.",
    candles: [[20, 52, 18, 50], [54, 58, 52, 56], [52, 54, 22, 24]],
  },
  {
    id: "dark-cloud-cover",
    name: "Nube oscura",
    bias: "bearish",
    description: "Tras una vela alcista, la bajista abre arriba y cierra bajo la mitad de su cuerpo.",
    rule: "Alcista larga y bajista que abre ≥ su cierre y cierra entre la apertura y la mitad de la primera.",
    candles: [[20, 52, 18, 50], [56, 58, 30, 32]],
  },
  {
    id: "three-black-crows",
    name: "Tres cuervos negros",
    bias: "bearish",
    description: "Tres velas bajistas seguidas con cierres decrecientes: fuerte presión vendedora sostenida.",
    rule: "Tres bajistas de cuerpo largo, cada una abre dentro de la anterior, cierra más bajo y apenas tiene mecha inferior.",
    candles: [[80, 82, 60, 62], [70, 72, 46, 48], [58, 60, 34, 36]],
  },
] as const satisfies readonly CandlePattern[]

export type PatternId = (typeof patternList)[number]["id"]

export const candlePatterns: readonly CandlePattern[] = patternList

export const patternById = Object.fromEntries(candlePatterns.map((p) => [p.id, p])) as Record<PatternId, CandlePattern>

export const biasLabel: Record<PatternBias, string> = { bullish: "Alcista", bearish: "Bajista" }
