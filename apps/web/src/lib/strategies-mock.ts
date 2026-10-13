// Mock data for the strategies UI. Replace with the real API once it exists.

export type RuleKind = "indicator" | "price" | "volume" | "periodic"
export type RuleSide = "buy" | "sell"

export type RuleParams = {
  indicator: {
    indicator: "rsi" | "sma-cross" | "macd" | "donchian"
    condition: "below" | "above"
    threshold: number
  }
  price: {
    direction: "down" | "up"
    /** Percentage. */
    threshold: number
    window: "1h" | "24h" | "7d" | "entry"
  }
  volume: {
    condition: "above" | "below"
    /** Multiple of the average volume. */
    multiple: number
    /** Candles used for the average. */
    period: number
  }
  periodic: {
    every: "day" | "week" | "month"
    /** USDT per order. */
    amount: number
  }
}

export type StrategyRule = {
  [K in RuleKind]: {
    id: string
    side: RuleSide
    kind: K
    params: RuleParams[K]
    /** Human-readable condition. */
    summary: string
  }
}[RuleKind]

export type Strategy = {
  id: string
  name: string
  /** ISO timestamp. */
  updatedAt: string
  rules: StrategyRule[]
}

export const strategies: Strategy[] = [
  {
    id: "st-1",
    name: "Cruce de medias (SMA 20/50)",
    updatedAt: "2026-10-12T18:42:00Z",
    rules: [
      {
        id: "r1",
        side: "buy",
        kind: "indicator",
        params: { indicator: "sma-cross", condition: "above", threshold: 0 },
        summary: "SMA 20 cruza por encima de SMA 50",
      },
      {
        id: "r2",
        side: "sell",
        kind: "indicator",
        params: { indicator: "sma-cross", condition: "below", threshold: 0 },
        summary: "SMA 20 cruza por debajo de SMA 50",
      },
    ],
  },
  {
    id: "st-2",
    name: "RSI reversión a la media",
    updatedAt: "2026-10-09T09:15:00Z",
    rules: [
      {
        id: "r1",
        side: "buy",
        kind: "indicator",
        params: { indicator: "rsi", condition: "below", threshold: 30 },
        summary: "RSI (14) cae por debajo de 30",
      },
      {
        id: "r2",
        side: "sell",
        kind: "indicator",
        params: { indicator: "rsi", condition: "above", threshold: 70 },
        summary: "RSI (14) sube por encima de 70",
      },
    ],
  },
  {
    id: "st-3",
    name: "Ruptura de rango (Donchian)",
    updatedAt: "2026-10-04T20:03:00Z",
    rules: [
      {
        id: "r1",
        side: "buy",
        kind: "indicator",
        params: { indicator: "donchian", condition: "above", threshold: 20 },
        summary: "El precio supera el máximo de las últimas 20 velas",
      },
      {
        id: "r2",
        side: "sell",
        kind: "indicator",
        params: { indicator: "donchian", condition: "below", threshold: 10 },
        summary: "El precio pierde el mínimo de las últimas 10 velas",
      },
      {
        id: "r3",
        side: "buy",
        kind: "volume",
        params: { condition: "above", multiple: 1.5, period: 20 },
        summary: "El volumen es 1,5× su media de 20 velas",
      },
    ],
  },
  {
    id: "st-4",
    name: "DCA semanal",
    updatedAt: "2026-09-28T11:27:00Z",
    rules: [
      {
        id: "r1",
        side: "buy",
        kind: "periodic",
        params: { every: "week", amount: 100 },
        summary: "Comprar 100 USDT cada lunes",
      },
    ],
  },
  {
    id: "st-5",
    name: "Comprar caídas, vender subidas",
    updatedAt: "2026-09-21T16:50:00Z",
    rules: [
      {
        id: "r1",
        side: "buy",
        kind: "price",
        params: { direction: "down", threshold: 8, window: "24h" },
        summary: "El precio cae un 8 % en 24 h",
      },
      {
        id: "r2",
        side: "sell",
        kind: "price",
        params: { direction: "up", threshold: 12, window: "entry" },
        summary: "El precio sube un 12 % desde la compra",
      },
    ],
  },
]

/** Example rules shown in the "new strategy" form. */
export const draftRules: StrategyRule[] = [
  {
    id: "d1",
    side: "buy",
    kind: "indicator",
    params: { indicator: "rsi", condition: "below", threshold: 30 },
    summary: "RSI (14) cae por debajo de 30",
  },
  {
    id: "d2",
    side: "buy",
    kind: "price",
    params: { direction: "down", threshold: 8, window: "24h" },
    summary: "El precio cae un 8 % en 24 h",
  },
  {
    id: "d3",
    side: "sell",
    kind: "indicator",
    params: { indicator: "rsi", condition: "above", threshold: 70 },
    summary: "RSI (14) sube por encima de 70",
  },
]

export function getStrategy(id: string) {
  return strategies.find((s) => s.id === id)
}
