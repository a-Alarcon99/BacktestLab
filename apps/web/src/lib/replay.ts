// Timing of the backtest replay animation.

export const REPLAY_MIN_SECONDS = 5
export const REPLAY_MAX_SECONDS = 20

/** 5 s up to 100 candles, 20 s from 3.000 candles on, linear in between. */
export function replayDuration(candleCount: number) {
  const t = Math.min(1, Math.max(0, (candleCount - 100) / 2900))
  return (REPLAY_MIN_SECONDS + (REPLAY_MAX_SECONDS - REPLAY_MIN_SECONDS) * t) * 1000
}
