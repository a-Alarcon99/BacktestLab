// Mock data for the backtest replay UI. Replace with the real backtest result once it exists.

export type ReplayCandle = { open: number; high: number; low: number; close: number }
export type ReplayTrade = { index: number; side: "buy" | "sell"; price: number }

export type Replay = {
  candles: ReplayCandle[]
  trades: ReplayTrade[]
  /** Per candle, cumulative up to and including it. */
  buys: number[]
  sells: number[]
  realized: number[]
  equity: number[]
  stats: {
    buys: number
    sells: number
    realizedPnl: number
    unrealizedPnl: number
    returnPct: number
    winRatePct: number
    maxDrawdownPct: number
    finalCapital: number
    openPosition: boolean
  }
}

export const REPLAY_MIN_SECONDS = 5
export const REPLAY_MAX_SECONDS = 20
/** Animation steps are capped so very long ranges stay smooth; stats still report the real count. */
export const REPLAY_MAX_STEPS = 1500

/** 5 s up to 100 candles, 20 s from 3.000 candles on, linear in between. */
export function replayDuration(candleCount: number) {
  const t = Math.min(1, Math.max(0, (candleCount - 100) / 2900))
  return (REPLAY_MIN_SECONDS + (REPLAY_MAX_SECONDS - REPLAY_MIN_SECONDS) * t) * 1000
}

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic random-walk candles with a mock SMA 10/30 crossover strategy on top. */
export function buildReplay(seed: number, steps: number, initialCapital = 10_000): Replay {
  const rand = rng(seed)
  const candles: ReplayCandle[] = []
  let price = 100
  let trend = 0
  for (let i = 0; i < steps; i++) {
    trend = trend * 0.97 + (rand() - 0.5) * 0.004
    const open = price
    const close = Math.max(1, open * (1 + trend + (rand() - 0.5) * 0.03))
    const high = Math.max(open, close) * (1 + rand() * 0.012)
    const low = Math.min(open, close) * (1 - rand() * 0.012)
    candles.push({ open, high, low, close })
    price = close
  }

  const sma = (i: number, n: number) => {
    let sum = 0
    for (let k = i - n + 1; k <= i; k++) sum += candles[k].close
    return sum / n
  }

  const trades: ReplayTrade[] = []
  const buys: number[] = []
  const sells: number[] = []
  const realized: number[] = []
  const equity: number[] = []
  let cash = initialCapital
  let qty = 0
  let entry = 0
  let nBuys = 0
  let nSells = 0
  let realizedPnl = 0
  let wins = 0
  let peak = initialCapital
  let maxDrawdown = 0

  for (let i = 0; i < steps; i++) {
    const close = candles[i].close
    if (i >= 30) {
      const crossUp = sma(i - 1, 10) <= sma(i - 1, 30) && sma(i, 10) > sma(i, 30)
      const crossDown = sma(i - 1, 10) >= sma(i - 1, 30) && sma(i, 10) < sma(i, 30)
      if (crossUp && qty === 0) {
        qty = cash / close
        entry = close
        cash = 0
        nBuys++
        trades.push({ index: i, side: "buy", price: close })
      } else if (crossDown && qty > 0) {
        const pnl = qty * (close - entry)
        cash = qty * close
        qty = 0
        realizedPnl += pnl
        if (pnl > 0) wins++
        nSells++
        trades.push({ index: i, side: "sell", price: close })
      }
    }
    const value = cash + qty * close
    peak = Math.max(peak, value)
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak)
    buys.push(nBuys)
    sells.push(nSells)
    realized.push(realizedPnl)
    equity.push(value)
  }

  const last = candles[steps - 1].close
  const unrealizedPnl = qty > 0 ? qty * (last - entry) : 0
  const finalCapital = cash + qty * last
  return {
    candles,
    trades,
    buys,
    sells,
    realized,
    equity,
    stats: {
      buys: nBuys,
      sells: nSells,
      realizedPnl,
      unrealizedPnl,
      returnPct: ((finalCapital - initialCapital) / initialCapital) * 100,
      winRatePct: nSells ? (wins / nSells) * 100 : 0,
      maxDrawdownPct: maxDrawdown * 100,
      finalCapital,
      openPosition: qty > 0,
    },
  }
}
