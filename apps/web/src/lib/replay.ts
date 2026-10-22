// Timing of the backtest replay animation.

export const REPLAY_MIN_SECONDS = 8
export const REPLAY_MAX_SECONDS = 45
/** Candles revealed per second at 1×. The chart shows a window of candles that scrolls at this pace. */
export const REPLAY_CANDLES_PER_SECOND = 30

/** Duration (ms) at 1× for `steps` drawn candles: fixed reveal speed, between the min and max seconds. */
export function replayDuration(steps: number) {
  const seconds = steps / REPLAY_CANDLES_PER_SECOND
  return Math.min(REPLAY_MAX_SECONDS, Math.max(REPLAY_MIN_SECONDS, seconds)) * 1000
}
