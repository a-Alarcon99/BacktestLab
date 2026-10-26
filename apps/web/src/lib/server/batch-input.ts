// Pure helpers for multi-run requests (no database or framework imports: unit tested directly).
// A request is one of four kinds, all through `/backtests/batch`: the same strategy over several
// assets, over rolling windows, with varied parameters, or on neighbouring timeframes. Each costs
// one backtest unit per simulation, a number worked out here and never read from the client.

import {
  chosenTimeframes,
  MAX_AXES,
  MAX_EXTRA_TIMEFRAMES,
  MC_MAX_PATHS,
  MC_MIN_PATHS,
  MC_PATHS_UNITS,
  mcPathsProblem,
  sensitivityCells,
  windowCount,
  TIMEFRAME_ORDER,
} from "../robustness-plan.ts";

/** Hard ceiling of simulations per request whatever the plan says (the engine caps it too). */
export const BATCH_ABSOLUTE_MAX = 100;

const SYMBOL = /^[A-Za-z0-9]{1,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PARAM = /^\d{1,2}:\d{1,2}:[a-z_]{1,24}$/;

export type BatchInput = {
  kind: "assets" | "windows" | "sensitivity" | "timeframes" | "mc-paths";
  /** Body to forward: symbols upper-cased and de-duplicated, in the order the user chose them. */
  forward: Record<string, unknown>;
  /** Same body with the symbols sorted, so the same set of assets in another order hashes alike. */
  hashBody: Record<string, unknown>;
  /** Backtest units to charge: one per simulation. Always derived here, never read from the client. */
  units: number;
  /** Monte Carlo over synthetic paths only: how many the request simulates (bounded by the plan). */
  paths?: number;
};

const isDay = (value: unknown): value is string => typeof value === "string" && DAY.test(value) && !Number.isNaN(Date.parse(value));
const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** `null` when the body isn't a well-formed multi-run request. */
export function parseBatchBody(body: unknown): BatchInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.kind === "assets") return parseAssets(record);
  if (record.kind === "mc-paths") return parseMcPaths(record);
  if (record.kind !== "windows" && record.kind !== "sensitivity" && record.kind !== "timeframes") return null;

  const { kind, symbol, from, to, timeframe } = record;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol) || !isDay(from) || !isDay(to) || from > to) return null;
  if (typeof timeframe !== "string" || !(TIMEFRAME_ORDER as readonly string[]).includes(timeframe)) return null;
  const forward: Record<string, unknown> = { ...record, symbol: symbol.toUpperCase() };

  let units: number;
  if (kind === "windows") {
    const { lengthDays, stepDays } = record;
    if (!isInt(lengthDays, 2, 3650) || !isInt(stepDays, 1, 3650)) return null;
    units = windowCount(from, to, lengthDays, stepDays);
  } else if (kind === "sensitivity") {
    const { params } = record;
    if (!Array.isArray(params) || params.length < 1 || params.length > MAX_AXES) return null;
    if (!params.every((p) => typeof p === "string" && PARAM.test(p)) || new Set(params).size !== params.length) return null;
    units = sensitivityCells(params.length);
  } else {
    const { timeframes } = record;
    const known = TIMEFRAME_ORDER as readonly string[];
    if (timeframes !== undefined) {
      if (!Array.isArray(timeframes) || timeframes.length < 1 || timeframes.length > MAX_EXTRA_TIMEFRAMES) return null;
      if (!timeframes.every((tf) => typeof tf === "string" && known.includes(tf)) || new Set(timeframes).size !== timeframes.length) return null;
      // The same set in another order is the same test, so it hashes alike.
      forward.timeframes = known.filter((tf) => timeframes.includes(tf));
    }
    units = chosenTimeframes(timeframe as (typeof TIMEFRAME_ORDER)[number], timeframes as (typeof TIMEFRAME_ORDER)[number][] | undefined, from, to).length;
  }
  if (units < 1) return null;
  return { kind, forward, hashBody: forward, units };
}

function parseMcPaths(record: Record<string, unknown>): BatchInput | null {
  const { symbol, from, to, timeframe, paths, blockLength, seed } = record;
  if (typeof symbol !== "string" || !SYMBOL.test(symbol) || !isDay(from) || !isDay(to) || from > to) return null;
  if (typeof timeframe !== "string" || !(TIMEFRAME_ORDER as readonly string[]).includes(timeframe)) return null;
  if (!isInt(paths, MC_MIN_PATHS, MC_MAX_PATHS)) return null;
  if (blockLength !== undefined && !isInt(blockLength, 1, 1000)) return null;
  if (seed !== undefined && !isInt(seed, 0, 2 ** 31 - 1)) return null;
  if (mcPathsProblem(from, to, timeframe as (typeof TIMEFRAME_ORDER)[number], paths) !== null) return null;
  const forward = { ...record, symbol: symbol.toUpperCase() };
  // The cost is fixed: more paths do not cost more backtests, they are bounded by the plan instead.
  return { kind: "mc-paths", forward, hashBody: forward, units: MC_PATHS_UNITS, paths };
}

function parseAssets(record: Record<string, unknown>): BatchInput | null {
  if (!Array.isArray(record.symbols)) return null;
  const symbols: string[] = [];
  for (const raw of record.symbols) {
    if (typeof raw !== "string" || !SYMBOL.test(raw)) return null;
    const symbol = raw.toUpperCase();
    if (!symbols.includes(symbol)) symbols.push(symbol);
    if (symbols.length > BATCH_ABSOLUTE_MAX) return null;
  }
  if (symbols.length === 0) return null;
  return {
    kind: "assets",
    forward: { ...record, symbols },
    hashBody: { ...record, symbols: [...symbols].sort() },
    units: symbols.length,
  };
}

/** Why a plan can't run `units` simulations in one request, or `null` if it can. */
export function batchPlanProblem(units: number, maxBatchItems: number): "not_allowed" | "too_many" | null {
  if (maxBatchItems <= 1) return "not_allowed";
  if (units < 2) return null;
  return units > maxBatchItems ? "too_many" : null;
}

/** Simulations of an engine batch response that could not run (their units are given back). */
export function failedItems(text: string): number {
  try {
    const parsed = JSON.parse(text) as { items?: { error?: unknown }[]; cells?: { error?: unknown }[] };
    const rows = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.cells) ? parsed.cells : [];
    return rows.filter((row) => row && row.error).length;
  } catch {
    return 0;
  }
}
