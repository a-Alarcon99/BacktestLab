import type { Timeframe } from "./candles.ts";
import type { Strategy } from "./strategy.ts";

// What a robustness test (rolling windows, parameter sensitivity, neighbouring timeframes) will
// run, worked out from the request alone. Mirrors `app/strategies/robustness.py`: the server
// derives the cost of a request from these functions, and the forms use them to preview it. Pure,
// with only type imports and relative `.ts` imports, so `node --test` can load it.

/** A backtest's candle cap and a batch's work budget (the API's `MAX_BACKTEST_CANDLES`, `MAX_BATCH_WORK`). */
export const ENGINE_MAX_CANDLES = 100_000;
export const ENGINE_MAX_WORK = 600_000;

/** Same order as the API's `TIMEFRAMES`: neighbours are the ones next to it in this list. */
export const TIMEFRAME_ORDER = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"] as const satisfies readonly Timeframe[];

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Upper bound of a candle's duration, as the engine uses it to size a range (a month is 31 days). */
const SPAN_MS: Record<Timeframe, number> = {
  "1m": MINUTE_MS,
  "3m": 3 * MINUTE_MS,
  "5m": 5 * MINUTE_MS,
  "15m": 15 * MINUTE_MS,
  "30m": 30 * MINUTE_MS,
  "1h": HOUR_MS,
  "2h": 2 * HOUR_MS,
  "4h": 4 * HOUR_MS,
  "1d": DAY_MS,
  "1w": 7 * DAY_MS,
  "1M": 31 * DAY_MS,
};

/** Candles of the inclusive day range [from, to] the way the engine counts them (not floored). */
export function engineCandles(from: string, to: string, timeframe: Timeframe): number {
  return (Date.parse(to) - Date.parse(from) + DAY_MS) / SPAN_MS[timeframe];
}

/** A window or timeframe needs this many candles to say anything. */
export const MIN_CANDLES = 10;

// --- Rolling windows ----------------------------------------------------------------------------

export type WindowBounds = { start: string; end: string };

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Number of windows of `length` days, `step` days apart, that fit in [from, to] (inclusive days). */
export function windowCount(from: string, to: string, length: number, step: number): number {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  if (!(length >= 1) || !(step >= 1) || days < length) return 0;
  return Math.floor((days - length) / step) + 1;
}

/** Inclusive start and end day of every window (same rule as the API's `window_bounds`). */
export function windowBounds(from: string, to: string, length: number, step: number): WindowBounds[] {
  const count = windowCount(from, to, length, step);
  const first = Date.parse(from);
  return Array.from({ length: count }, (_, i) => ({
    start: isoDay(first + i * step * DAY_MS),
    end: isoDay(first + (i * step + length - 1) * DAY_MS),
  }));
}

// --- Neighbouring timeframes --------------------------------------------------------------------

/** Neighbours taken on each side of the timeframe asked for. */
export const TIMEFRAME_REACH = 2;

/** The timeframe and its neighbours that suit the range (same rule as the API's `neighbor_timeframes`). */
export function neighborTimeframes(timeframe: Timeframe, from: string, to: string, maxCandles = ENGINE_MAX_CANDLES): Timeframe[] {
  const at = TIMEFRAME_ORDER.indexOf(timeframe);
  return TIMEFRAME_ORDER.slice(Math.max(0, at - TIMEFRAME_REACH), at + TIMEFRAME_REACH + 1).filter((tf) => {
    if (tf === timeframe) return true;
    const candles = engineCandles(from, to, tf);
    return candles >= MIN_CANDLES && candles <= maxCandles;
  });
}

/** Most timeframes besides the one asked for that one test compares. */
export const MAX_EXTRA_TIMEFRAMES = 5;

/** Whether `timeframe` gives a usable number of candles over the range (the same bounds neighbours need). */
export function timeframeFits(timeframe: Timeframe, from: string, to: string, maxCandles = ENGINE_MAX_CANDLES): boolean {
  const candles = engineCandles(from, to, timeframe);
  return candles >= MIN_CANDLES && candles <= maxCandles;
}

/**
 * The timeframes a test runs, in `TIMEFRAME_ORDER` (same rule as the API's `chosen_timeframes`):
 * the one asked for plus `requested`, or its neighbours when `requested` is absent. One that
 * doesn't fit the range is left out; the one asked for is always kept.
 */
export function chosenTimeframes(timeframe: Timeframe, requested: readonly Timeframe[] | undefined, from: string, to: string, maxCandles = ENGINE_MAX_CANDLES): Timeframe[] {
  if (!requested) return neighborTimeframes(timeframe, from, to, maxCandles);
  return TIMEFRAME_ORDER.filter((tf) => (tf === timeframe || requested.includes(tf)) && (tf === timeframe || timeframeFits(tf, from, to, maxCandles)));
}

// --- Parameter sensitivity ----------------------------------------------------------------------

/** Relative steps of a parameter around its value: five levels per axis. */
export const LEVELS = [-0.2, -0.1, 0, 0.1, 0.2] as const;
export const MAX_AXES = 2;

/** Simulations of a grid with this many varied parameters. */
export const sensitivityCells = (axes: number) => LEVELS.length ** axes;

/** Numeric settings the sensitivity test can vary per condition kind, with the range each accepts. */
const TUNABLE: Record<string, { field: string; lo: number; hi: number; integer: boolean }[]> = {
  rsi: [
    { field: "period", lo: 2, hi: 200, integer: true },
    { field: "value", lo: 1, hi: 99, integer: false },
  ],
  "ma-cross": [
    { field: "fast", lo: 2, hi: 200, integer: true },
    { field: "slow", lo: 2, hi: 200, integer: true },
  ],
  macd: [
    { field: "fast", lo: 2, hi: 200, integer: true },
    { field: "slow", lo: 2, hi: 200, integer: true },
    { field: "signal", lo: 2, hi: 200, integer: true },
  ],
  bollinger: [
    { field: "period", lo: 2, hi: 200, integer: true },
    { field: "stdDev", lo: 0.5, hi: 5, integer: false },
  ],
  donchian: [{ field: "period", lo: 2, hi: 200, integer: true }],
  "price-change": [
    { field: "pct", lo: 0.1, hi: 1000, integer: false },
    { field: "lookback", lo: 1, hi: 200, integer: true },
  ],
  volume: [
    { field: "multiple", lo: 0.1, hi: 100, integer: false },
    { field: "period", lo: 2, hi: 200, integer: true },
  ],
};

export type SensitivityParam = {
  /** "<rule>:<condition>:<field>", positions in the strategy's rules (the API's parameter ids). */
  id: string;
  ruleIndex: number;
  conditionIndex: number;
  kind: string;
  side: "buy" | "sell";
  field: string;
  base: number;
  /** Value at each of the `LEVELS`, rounded and kept inside what the parameter accepts. */
  values: number[];
};

/** The parameters of the strategy's conditions the test can vary, in rule order. */
export function sensitivityParams(strategy: Pick<Strategy, "rules">): SensitivityParam[] {
  const found: SensitivityParam[] = [];
  strategy.rules.forEach((rule, ruleIndex) => {
    rule.conditions.forEach((condition, conditionIndex) => {
      for (const tunable of TUNABLE[condition.kind] ?? []) {
        const base = (condition as unknown as Record<string, unknown>)[tunable.field];
        if (typeof base !== "number") continue; // e.g. a price change measured "since the entry"
        const values = LEVELS.map((level) => {
          const value = Math.min(Math.max(base * (1 + level), tunable.lo), tunable.hi);
          return tunable.integer ? Math.round(value) : Math.round(value * 100) / 100;
        });
        found.push({
          // The API names fields in snake_case.
          id: `${ruleIndex}:${conditionIndex}:${tunable.field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`,
          ruleIndex,
          conditionIndex,
          kind: condition.kind,
          side: rule.side,
          field: tunable.field,
          base,
          values,
        });
      }
    });
  });
  return found;
}

/** Candles of `days` days on the timeframe, the way the engine counts them. */
export const candlesPerDays = (days: number, timeframe: Timeframe) => (days * DAY_MS) / SPAN_MS[timeframe];

// --- Monte Carlo over synthetic paths -----------------------------------------------------------
// Mirrors `app/strategies/montecarlo.py` and the `mc-paths` preparer of the API.

/** Fewer candles say nothing about how the market moves (the API's `MIN_CANDLES` of Monte Carlo). */
export const MC_MIN_CANDLES = 30;
export const MC_MIN_PATHS = 10;
export const MC_MAX_PATHS = 1000;
/** `candles x paths` the engine accepts in one Monte Carlo run (its `MAX_MC_WORK`). */
export const ENGINE_MC_WORK = 1_000_000;
/** Backtests a Monte Carlo run over synthetic paths counts as, whatever its number of paths. */
export const MC_PATHS_UNITS = 2;

/** Candles moved together by default: about the square root of the candles of the range. */
export const mcDefaultBlock = (candles: number) => Math.max(2, Math.min(candles, Math.round(Math.sqrt(candles))));

/** Why a Monte Carlo run over synthetic paths can't be requested, or `null`. */
export function mcPathsProblem(from: string, to: string, timeframe: Timeframe, paths: number): "too_short" | "too_much" | null {
  const candles = engineCandles(from, to, timeframe);
  if (candles < MC_MIN_CANDLES) return "too_short";
  return candles * paths > ENGINE_MC_WORK ? "too_much" : null;
}

/** The most paths the engine accepts for this range (never above `MC_MAX_PATHS`). */
export const mcMaxPathsFor = (from: string, to: string, timeframe: Timeframe) =>
  Math.min(MC_MAX_PATHS, Math.floor(ENGINE_MC_WORK / Math.max(1, engineCandles(from, to, timeframe))));
