// Timing of the backtest replay animation.

export const REPLAY_MIN_SECONDS = 8
export const REPLAY_MAX_SECONDS = 90
/** Candles revealed per second. The chart shows a ~100-candle window that scrolls at this pace. */
export const REPLAY_CANDLES_PER_SECOND = 30

/** Duration (ms) for `steps` drawn candles: fixed reveal speed, between 5 s and 30 s. */
export function replayDuration(steps: number) {
  const seconds = steps / REPLAY_CANDLES_PER_SECOND
  return Math.min(REPLAY_MAX_SECONDS, Math.max(REPLAY_MIN_SECONDS, seconds)) * 1000
}
