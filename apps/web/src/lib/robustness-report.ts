import type { Tone } from "./backtest-report.ts"
import type { RunSummary, SensitivityBatchResult, TimeframesBatchResult, WindowsBatchResult } from "./backtests.ts"

// Pure logic of the robustness tests: a traffic light per criterion and a 0-100 score for each
// test, plus the helpers the animations draw from. Only type imports and relative `.ts` imports,
// so `node --test` can load it; texts live in the components (this returns codes, tones, numbers).

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const DAY_MS = 86_400_000;

export type RobustTest = "windows" | "sensitivity" | "timeframes";

/** One thing a test checks, with its own traffic light. `value` is a share (0-1) or points of return. */
export type Criterion = { id: string; tone: Tone; value: number | null };

export type RobustReport = {
  test: RobustTest;
  /** 0-100, the weighted sum of the criteria (continuous, so two runs rarely tie). */
  score: number;
  tone: Tone;
  headline: string;
  /** Too few simulations to call it either way. */
  smallSample: boolean;
  criteria: Criterion[];
};

/** Traffic light of a score. */
export const scoreTone = (score: number): Tone => (score >= 70 ? "good" : score >= 45 ? "mixed" : "bad");

/** Tone from a value that is better the higher it is: `good` at or above one limit, `mixed` at or above the other. */
const higher = (value: number, good: number, mixed: number): Tone => (value >= good ? "good" : value >= mixed ? "mixed" : "bad");

const share = (count: number, total: number) => (total === 0 ? 0 : count / total);

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const withSummary = <T extends { summary: RunSummary | null }>(items: T[]) => items.filter((item): item is T & { summary: RunSummary } => item.summary !== null);

// --- Rolling windows ----------------------------------------------------------------------------

export const SMALL_WINDOWS = 4;

export type WindowsReport = RobustReport & {
  test: "windows";
  total: number;
  ran: number;
  positive: number;
  beatsHold: number;
  medianReturnPct: number | null;
  worst: { index: number; returnPct: number } | null;
  best: { index: number; returnPct: number } | null;
  worstDrawdownPct: number | null;
};

export function windowsReport(result: WindowsBatchResult): WindowsReport {
  const ran = withSummary(result.items);
  const returns = ran.map((item) => item.summary.returnPct);
  const indexed = result.items.flatMap((item, index) => (item.summary ? [{ index, returnPct: item.summary.returnPct }] : []));
  const byReturn = [...indexed].sort((a, b) => a.returnPct - b.returnPct);
  const positive = ran.filter((item) => item.summary.returnPct > 0).length;
  const beatsHold = ran.filter((item) => item.summary.returnPct > item.summary.benchmarkReturnPct).length;
  const worstDrawdownPct = ran.length ? Math.max(...ran.map((item) => item.summary.maxDrawdownPct)) : null;
  const worstReturn = byReturn[0]?.returnPct ?? 0;

  const positiveShare = share(positive, ran.length);
  const beatsShare = share(beatsHold, ran.length);
  const criteria: Criterion[] = [
    { id: "positive", tone: ran.length ? higher(positiveShare, 0.7, 0.5) : "bad", value: positiveShare },
    { id: "beats", tone: ran.length ? higher(beatsShare, 0.5, 0.3) : "bad", value: beatsShare },
    { id: "worst", tone: ran.length ? higher(worstReturn, -15, -30) : "bad", value: ran.length ? worstReturn : null },
    { id: "drawdown", tone: worstDrawdownPct === null ? "bad" : higher(-worstDrawdownPct, -25, -45), value: worstDrawdownPct },
  ];
  const score = ran.length
    ? Math.round(100 * (0.4 * positiveShare + 0.25 * clamp01(beatsShare / 0.6) + 0.2 * clamp01(1 + worstReturn / 40) + 0.15 * clamp01(1 - (worstDrawdownPct ?? 100) / 60)))
    : 0;
  const tone = scoreTone(score);
  const headline = ran.length === 0 ? "none" : tone === "good" ? "consistent" : tone === "mixed" ? (positiveShare >= 0.5 ? "uneven" : "fragile") : positiveShare > 0.2 ? "fragile" : "loses";
  return {
    test: "windows",
    score,
    tone,
    headline,
    smallSample: ran.length < SMALL_WINDOWS,
    criteria,
    total: result.items.length,
    ran: ran.length,
    positive,
    beatsHold,
    medianReturnPct: median(returns),
    worst: byReturn[0] ?? null,
    best: byReturn.at(-1) ?? null,
    worstDrawdownPct,
  };
}

/** Lane of each window (0-based) so that overlapping windows never share one: greedy interval partition. */
export function windowLanes(windows: { start: string; end: string }[]): number[] {
  const laneEnds: number[] = [];
  return windows.map((w) => {
    const start = Date.parse(w.start);
    let lane = laneEnds.findIndex((end) => end < start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = Date.parse(w.end);
    return lane;
  });
}

/** How much of a window has happened at `timeMs`: 0 before it starts, 1 once its last day is over. */
export function windowProgress(window: { start: string; end: string }, timeMs: number): number {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end) + DAY_MS;
  return clamp01((timeMs - start) / (end - start));
}

// --- Sensitivity --------------------------------------------------------------------------------

/** Index of the unchanged value in an axis (`LEVELS` has the 0 in the middle). */
export const CENTRE = 2;

export type SensitivityReport = RobustReport & {
  test: "sensitivity";
  total: number;
  ran: number;
  /** Variants not run because they broke a condition or made the rules contradict. */
  skipped: number;
  profitable: number;
  baseReturnPct: number | null;
  /** Average return of the variants right next to the original one (±1 step on each axis). */
  neighborReturnPct: number | null;
  /** Neighbours' average return as a share of the original's (only when the original is profitable). */
  retention: number | null;
  minReturnPct: number | null;
  maxReturnPct: number | null;
};

type Cell = SensitivityBatchResult["cells"][number];

export const isBaseCell = (cell: Pick<Cell, "coords">) => cell.coords.every((c) => c === CENTRE);

const isNeighbor = (cell: Pick<Cell, "coords">) => !isBaseCell(cell) && cell.coords.every((c) => Math.abs(c - CENTRE) <= 1);

export const SMALL_CELLS = 5;

export function sensitivityReport(result: SensitivityBatchResult): SensitivityReport {
  const ran = withSummary(result.cells);
  const returns = ran.map((cell) => cell.summary.returnPct);
  const base = ran.find(isBaseCell)?.summary.returnPct ?? null;
  const neighbors = ran.filter(isNeighbor).map((cell) => cell.summary.returnPct);
  const neighborReturnPct = neighbors.length ? neighbors.reduce((sum, r) => sum + r, 0) / neighbors.length : null;
  const retention = base !== null && base > 0 && neighborReturnPct !== null ? neighborReturnPct / base : null;
  const profitable = returns.filter((r) => r > 0).length;
  const profitableShare = share(profitable, ran.length);
  const min = returns.length ? Math.min(...returns) : null;

  // A plateau (the neighbours do about as well as the original) is robust; an isolated peak is overfit.
  const plateauTone: Tone = retention === null ? "bad" : higher(retention, 0.7, 0.4);
  const criteria: Criterion[] = [
    { id: "profitable", tone: ran.length ? higher(profitableShare, 0.7, 0.5) : "bad", value: profitableShare },
    { id: "plateau", tone: plateauTone, value: retention },
    { id: "worst", tone: min === null ? "bad" : higher(min, 0, -15), value: min },
  ];
  const score = ran.length ? Math.round(100 * (0.4 * profitableShare + 0.4 * clamp01(retention ?? 0) + 0.2 * clamp01(1 + (min ?? -30) / 30))) : 0;
  const tone = scoreTone(score);
  let headline: string;
  if (ran.length === 0) headline = "none";
  else if (base === null || base <= 0) headline = profitableShare >= 0.5 ? "mixed" : "weak";
  else if (retention !== null && retention < 0.4) headline = "peak";
  else if (tone === "good") headline = "plateau";
  else headline = tone === "mixed" ? "mixed" : "weak";
  return {
    test: "sensitivity",
    score,
    tone,
    headline,
    smallSample: ran.length < SMALL_CELLS,
    criteria,
    total: result.cells.length,
    ran: ran.length,
    skipped: result.cells.length - ran.length,
    profitable,
    baseReturnPct: base,
    neighborReturnPct,
    retention,
    minReturnPct: min,
    maxReturnPct: returns.length ? Math.max(...returns) : null,
  };
}

/** Order in which the cells fill in: rippling out from the original variant, then by position. */
export function revealOrder(cells: Pick<Cell, "coords">[]): number[] {
  const distance = (cell: Pick<Cell, "coords">) => Math.hypot(...cell.coords.map((c) => c - CENTRE));
  return cells
    .map((cell, index) => ({ index, d: distance(cell) }))
    .sort((a, b) => a.d - b.d || a.index - b.index)
    .map(({ index }) => index);
}

/** Opacity (0-1) of the cell at `rank` of `count` once the animation is at `progress` (0-1): each fades in on its turn. */
export function cellReveal(rank: number, count: number, progress: number): number {
  return clamp01(progress * count - rank);
}

// --- Neighbouring timeframes --------------------------------------------------------------------

export type TimeframesReport = RobustReport & {
  test: "timeframes";
  total: number;
  ran: number;
  profitable: number;
  beatsHold: number;
  /** Return on the timeframe asked for, and the best and worst of the others. */
  chosenReturnPct: number | null;
  bestTimeframe: string | null;
  spreadPts: number | null;
};

export const SMALL_TIMEFRAMES = 3;

export function timeframesReport(result: TimeframesBatchResult, chosen: string): TimeframesReport {
  const ran = withSummary(result.items);
  const others = ran.filter((item) => item.timeframe !== chosen);
  const profitable = ran.filter((item) => item.summary.returnPct > 0).length;
  const beatsHold = ran.filter((item) => item.summary.returnPct > item.summary.benchmarkReturnPct).length;
  const profitableShare = share(profitable, ran.length);
  const beatsShare = share(beatsHold, ran.length);
  const neighborShare = share(others.filter((item) => item.summary.returnPct > 0).length, others.length);
  const returns = ran.map((item) => item.summary.returnPct);
  const best = [...ran].sort((a, b) => b.summary.returnPct - a.summary.returnPct)[0];
  const chosenReturn = ran.find((item) => item.timeframe === chosen)?.summary.returnPct ?? null;

  const criteria: Criterion[] = [
    { id: "profitable", tone: ran.length ? higher(profitableShare, 0.8, 0.5) : "bad", value: profitableShare },
    { id: "beats", tone: ran.length ? higher(beatsShare, 0.5, 0.3) : "bad", value: beatsShare },
    { id: "neighbors", tone: others.length ? higher(neighborShare, 0.6, 0.4) : "bad", value: neighborShare },
  ];
  const score = ran.length ? Math.round(100 * (0.4 * profitableShare + 0.25 * clamp01(beatsShare / 0.6) + 0.35 * neighborShare)) : 0;
  const tone = scoreTone(score);
  let headline: string;
  if (ran.length === 0) headline = "none";
  else if (chosenReturn !== null && chosenReturn > 0 && others.length > 0 && neighborShare === 0) headline = "lonely";
  else headline = tone === "good" ? "consistent" : tone === "mixed" ? "mixed" : "weak";
  return {
    test: "timeframes",
    score,
    tone,
    headline,
    smallSample: ran.length < SMALL_TIMEFRAMES,
    criteria,
    total: result.items.length,
    ran: ran.length,
    profitable,
    beatsHold,
    chosenReturnPct: chosenReturn,
    bestTimeframe: best?.timeframe ?? null,
    spreadPts: returns.length ? Math.max(...returns) - Math.min(...returns) : null,
  };
}

// --- Curves -------------------------------------------------------------------------------------

/** Points of a curve to draw at `progress` (0-1) of the animation, with the last one interpolated so it glides. */
export function curveUpTo(curve: number[], progress: number): number[] {
  if (curve.length === 0) return [];
  const at = clamp01(progress) * (curve.length - 1);
  const whole = Math.floor(at);
  const points = curve.slice(0, whole + 1);
  const frac = at - whole;
  if (frac > 0 && whole + 1 < curve.length) points.push(curve[whole] + (curve[whole + 1] - curve[whole]) * frac);
  return points;
}

/** Value of a curve at the fraction `at` (0-1) of its run, interpolated; `null` for an empty curve. */
export function curveValueAt(curve: number[], at: number): number | null {
  if (curve.length === 0) return null;
  if (curve.length === 1) return curve[0];
  const k = clamp01(at) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(k));
  return curve[i] + (curve[i + 1] - curve[i]) * (k - i);
}

// --- CSV ----------------------------------------------------------------------------------------

/**
 * Rows as CSV for spreadsheets (same conventions as `batchCsv`: `;` and a decimal comma in Spanish,
 * `,` and a point in English, BOM first). Numbers keep 2 decimals; `null` leaves the cell empty.
 */
export function tableCsv(headers: string[], rows: (string | number | null)[][], locale: "es" | "en") {
  const sep = locale === "es" ? ";" : ",";
  const cell = (value: string | number | null) => {
    if (value === null) return "";
    const fixed = typeof value === "number" ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : value;
    const text = typeof value === "number" && locale === "es" ? fixed.replace(".", ",") : fixed;
    return text.includes(sep) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const eol = "\r\n";
  return `﻿${[headers.map(cell).join(sep), ...rows.map((row) => row.map(cell).join(sep))].join(eol)}${eol}`;
}

// --- Extra figures for the results -------------------------------------------------------------

const mean = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

const stdev = (values: number[]) => {
  const m = mean(values);
  return m === null || values.length < 2 ? null : Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
};

/** Value at quantile `q` (0-1) of an ascending list, interpolated. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const at = clamp01(q) * (sorted.length - 1);
  const whole = Math.floor(at);
  return whole + 1 < sorted.length ? sorted[whole] + (sorted[whole + 1] - sorted[whole]) * (at - whole) : sorted[whole];
}

/** A curve resampled to `points` evenly spaced points (linear). */
export function resample(curve: number[], points: number): number[] {
  if (curve.length === 0) return [];
  if (curve.length === 1) return Array.from({ length: points }, () => curve[0]);
  return Array.from({ length: points }, (_, k) => {
    const at = (k / Math.max(1, points - 1)) * (curve.length - 1);
    const whole = Math.min(curve.length - 2, Math.floor(at));
    return curve[whole] + (curve[whole + 1] - curve[whole]) * (at - whole);
  });
}

export type Fan = { median: number[]; lower: number[]; upper: number[] };

/** Median and interquartile band of several equity curves, point by point (each resampled to `points`). */
export function fanOf(curves: number[][], points = 48): Fan {
  const all = curves.filter((c) => c.length > 0).map((c) => resample(c, points));
  const column = (k: number) => all.map((c) => c[k]).sort((a, b) => a - b);
  const at = (q: number) => Array.from({ length: all.length ? points : 0 }, (_, k) => quantile(column(k), q));
  return { median: at(0.5), lower: at(0.25), upper: at(0.75) };
}

/** Buys and sells of a summary that happened by the fraction `u` (0-1) of its run. */
export function marksUpTo(marks: RunSummary["marks"], u: number): { buys: number; sells: number } {
  let buys = 0;
  let sells = 0;
  for (const mark of marks) {
    if (mark.at > u) continue;
    if (mark.side === "buy") buys++;
    else sells++;
  }
  return { buys, sells };
}

export type WindowsExtra = {
  meanReturnPct: number | null;
  stdevReturnPct: number | null;
  /** Longest run of consecutive windows that did not make money. */
  losingStreak: number;
  avgOrders: number | null;
  avgExposurePct: number | null;
  avgDrawdownPct: number | null;
};

export function windowsExtra(result: WindowsBatchResult): WindowsExtra {
  const ran = withSummary(result.items);
  let streak = 0;
  let longest = 0;
  for (const item of result.items) {
    if (!item.summary) continue;
    streak = item.summary.returnPct <= 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  return {
    meanReturnPct: mean(ran.map((i) => i.summary.returnPct)),
    stdevReturnPct: stdev(ran.map((i) => i.summary.returnPct)),
    losingStreak: longest,
    avgOrders: mean(ran.map((i) => i.summary.orders)),
    avgExposurePct: mean(ran.map((i) => i.summary.exposurePct)),
    avgDrawdownPct: mean(ran.map((i) => i.summary.maxDrawdownPct)),
  };
}

export type SensitivityStats = {
  mean: number;
  median: number;
  stdev: number | null;
  min: number;
  max: number;
  /** Best minus worst, in points of return. */
  spread: number;
};

export function sensitivityStats(result: SensitivityBatchResult): SensitivityStats | null {
  const returns = withSummary(result.cells).map((c) => c.summary.returnPct);
  if (returns.length === 0) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  return { mean: mean(returns) ?? 0, median: quantile(sorted, 0.5), stdev: stdev(returns), min: sorted[0], max: sorted.at(-1) ?? 0, spread: (sorted.at(-1) ?? 0) - sorted[0] };
}

export type AxisProfile = {
  axis: number;
  /** For each level of the axis: the return averaged over every variant at that level, and its extremes. */
  points: { level: number; value: number; mean: number | null; min: number | null; max: number | null }[];
};

/** How the return moves along each axis, averaging over the other one (a flat line is a plateau). */
export function axisProfiles(result: SensitivityBatchResult): AxisProfile[] {
  return result.axes.map((axis, k) => ({
    axis: k,
    points: axis.levels.map((level, l) => {
      const returns = withSummary(result.cells.filter((c) => c.coords[k] === l)).map((c) => c.summary.returnPct);
      return {
        level,
        value: axis.values[l],
        mean: mean(returns),
        min: returns.length ? Math.min(...returns) : null,
        max: returns.length ? Math.max(...returns) : null,
      };
    }),
  }));
}

/** Indices of the `count` best and worst variants by return. */
export function rankedCells(result: SensitivityBatchResult, count = 3): { best: number[]; worst: number[] } {
  const ordered = result.cells.flatMap((c, i) => (c.summary ? [{ i, r: c.summary.returnPct }] : [])).sort((a, b) => b.r - a.r || a.i - b.i);
  return { best: ordered.slice(0, count).map((o) => o.i), worst: ordered.slice(-count).reverse().map((o) => o.i) };
}

export type TimeframesExtra = {
  bestSharpe: string | null;
  lowestDrawdown: string | null;
  mostOrders: string | null;
};

export function timeframesExtra(result: TimeframesBatchResult): TimeframesExtra {
  const ran = withSummary(result.items);
  const pick = (key: (s: RunSummary) => number, direction: 1 | -1) => [...ran].sort((a, b) => direction * (key(b.summary) - key(a.summary)))[0]?.timeframe ?? null;
  return { bestSharpe: pick((s) => s.sharpe, 1), lowestDrawdown: pick((s) => s.maxDrawdownPct, -1), mostOrders: pick((s) => s.orders, 1) };
}
