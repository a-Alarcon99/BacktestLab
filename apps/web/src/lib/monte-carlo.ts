import type { Tone } from "./backtest-report.ts";
import type { McBands, McPathsBatchResult } from "./backtests.ts";

// Pure logic of Monte Carlo. Two sources feed the same summary:
//  - the real trades of a backtest, mixed up or drawn again at random (`resampleTrades`, no candles
//    and no server: it runs in the browser, in a Web Worker);
//  - synthetic price paths simulated by the engine (`summarizePaths` reads its aggregated answer).
// Everything is deterministic for a given seed. Only type imports and relative `.ts` imports, so
// `node --test` can load it; texts live in the components (this returns codes, tones and numbers).

/** Points of every curve (the engine sends the same number for its paths). */
export const CURVE_POINTS = 160;
/** Whole curves kept to draw one by one. */
export const SAMPLE_PATHS = 40;
/** Share of the runs seen at each step of the animation (the bands settle as more are added). */
export const CHECKPOINT_SHARES = [0.02, 0.04, 0.07, 0.12, 0.2, 0.3, 0.45, 0.65, 0.85, 1] as const;
export const BAND_PERCENTILES = [5, 25, 50, 75, 95] as const;
/** A path "ruins" the account when it falls this much (%) below its peak. */
export const RUIN_DRAWDOWN_PCT = 50;

/** How the real trades are mixed. */
export type McMethod = "shuffle" | "resample";

export type McSummary = {
  source: "trades" | "paths";
  /** Simulated runs (paths of the engine, or mixed-up sequences of the trades). */
  runs: number;
  /** Trades in a sequence (trades) or candles of the range (paths): what the x axis counts. */
  length: number;
  real: { returnPct: number; maxDrawdownPct: number; benchmarkReturnPct: number | null; curve: number[] };
  samples: number[][];
  bands: McBands;
  checkpoints: { runs: number; bands: McBands }[];
  /** Final return and deepest drawdown (%) of every run, in the order they were drawn. */
  returns: number[];
  drawdowns: number[];
  /** Share (%) of the runs that beat buying and holding on their own candles; paths only. */
  beatHoldPct: number | null;
  seed: number;
  /** How the trades were mixed (trades) or null (paths). */
  method: McMethod | null;
  /** Candles moved together in each synthetic path (paths) or null (trades). */
  blockLength: number | null;
};

// --- Random numbers and percentiles ---------------------------------------------------------------

/** Small fast generator (mulberry32): the same seed always gives the same sequence in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The `p`-th percentile (0-100) of already sorted values, interpolating like numpy's default. */
export function percentileOfSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const at = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

const sortedCopy = (values: number[]) => [...values].sort((a, b) => a - b);

export type Quantiles = { p5: number; p25: number; p50: number; p75: number; p95: number };

export function quantilesOf(values: number[]): Quantiles {
  const sorted = sortedCopy(values);
  const [p5, p25, p50, p75, p95] = BAND_PERCENTILES.map((p) => percentileOfSorted(sorted, p));
  return { p5, p25, p50, p75, p95 };
}

/** Share (0-100) of `values` that are at or below `x`: where `x` falls among them. */
export const rankOf = (values: number[], x: number) => (values.length === 0 ? 0 : (values.filter((v) => v <= x).length / values.length) * 100);

const round2 = (value: number) => Math.round(value * 100) / 100;

// --- Resampling the trades -----------------------------------------------------------------------

/**
 * What each closed trade did to the equity, as a factor (1.02 = +2 %). A trade's profit is taken
 * over the equity at its entry, so the factors compound whatever size the strategy trades.
 */
export function tradeFactors(pnls: number[], initialCapital: number): number[] {
  const factors: number[] = [];
  let equity = initialCapital;
  for (const pnl of pnls) {
    factors.push(equity > 0 ? Math.max(0, 1 + pnl / equity) : 1);
    equity += pnl;
  }
  return factors;
}

/** Equity (starting at 100) after each factor, and the deepest fall below a previous peak (%). */
export function compound(factors: ArrayLike<number>): { curve: number[]; maxDrawdownPct: number } {
  const curve = [100];
  let peak = 100;
  let worst = 0;
  for (let i = 0; i < factors.length; i++) {
    const value = curve[i] * factors[i];
    curve.push(value);
    if (value > peak) peak = value;
    else worst = Math.max(worst, ((peak - value) / peak) * 100);
  }
  return { curve, maxDrawdownPct: worst };
}

/** Indices of `points` evenly spaced positions among `length`. */
export function spacedIndices(length: number, points: number): number[] {
  const count = Math.min(points, length);
  return Array.from({ length: count }, (_, k) => (count === 1 ? 0 : Math.round((k * (length - 1)) / (count - 1))));
}

const bandsOf = (columns: number[][], runs: number): McBands => {
  const out: McBands = { p5: [], p25: [], p50: [], p75: [], p95: [] };
  for (const column of columns) {
    const sorted = sortedCopy(column.slice(0, runs));
    out.p5.push(round2(percentileOfSorted(sorted, 5)));
    out.p25.push(round2(percentileOfSorted(sorted, 25)));
    out.p50.push(round2(percentileOfSorted(sorted, 50)));
    out.p75.push(round2(percentileOfSorted(sorted, 75)));
    out.p95.push(round2(percentileOfSorted(sorted, 95)));
  }
  return out;
};

export const checkpointRuns = (runs: number): number[] => [...new Set(CHECKPOINT_SHARES.map((share) => Math.max(2, Math.min(runs, Math.round(runs * share)))))].sort((a, b) => a - b);

export type ResampleInput = {
  /** Profit of each closed trade, in order (USDT). */
  pnls: number[];
  initialCapital: number;
  runs: number;
  method: McMethod;
  seed: number;
};

/**
 * Many alternative histories of the same trades: `shuffle` keeps every trade and changes only the
 * order (the final result stays, the drawdown does not); `resample` draws each trade again at
 * random with replacement (the result changes too, as if the strategy had met other trades).
 */
export function resampleTrades({ pnls, initialCapital, runs, method, seed }: ResampleInput): McSummary {
  const factors = tradeFactors(pnls, initialCapital);
  const n = factors.length;
  const random = mulberry32(seed);
  const at = spacedIndices(n + 1, CURVE_POINTS);
  const real = compound(factors);

  const columns: number[][] = at.map(() => []);
  const returns: number[] = [];
  const drawdowns: number[] = [];
  const samples: number[][] = [];
  const kept = new Set(spacedIndices(runs, Math.min(SAMPLE_PATHS, runs)));
  const order = Array.from({ length: n }, (_, i) => i);
  const drawn = new Array<number>(n);
  for (let run = 0; run < runs; run++) {
    if (method === "shuffle") {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (let i = 0; i < n; i++) drawn[i] = factors[order[i]];
    } else {
      for (let i = 0; i < n; i++) drawn[i] = factors[Math.floor(random() * n)];
    }
    const path = compound(drawn);
    returns.push(round2(path.curve[n] - 100));
    drawdowns.push(round2(path.maxDrawdownPct));
    const shown = at.map((index) => round2(path.curve[index]));
    shown.forEach((value, k) => columns[k].push(value));
    if (kept.has(run)) samples.push(shown);
  }

  return {
    source: "trades",
    runs,
    length: n,
    real: {
      returnPct: round2(real.curve[n] - 100),
      maxDrawdownPct: round2(real.maxDrawdownPct),
      benchmarkReturnPct: null,
      curve: at.map((index) => round2(real.curve[index])),
    },
    samples,
    bands: bandsOf(columns, runs),
    checkpoints: checkpointRuns(runs).map((k) => ({ runs: k, bands: bandsOf(columns, k) })),
    returns,
    drawdowns,
    beatHoldPct: null,
    seed,
    method,
    blockLength: null,
  };
}

/** The engine's answer for synthetic paths, as the summary the views draw. */
export function summarizePaths(result: McPathsBatchResult): McSummary {
  return {
    source: "paths",
    runs: result.runs,
    length: result.candleCount,
    real: { returnPct: result.real.returnPct, maxDrawdownPct: result.real.maxDrawdownPct, benchmarkReturnPct: result.real.benchmarkReturnPct, curve: result.real.curve },
    samples: result.samples,
    bands: result.bands,
    checkpoints: result.checkpoints,
    returns: result.returns,
    drawdowns: result.drawdowns,
    beatHoldPct: result.beatHoldPct,
    seed: result.seed,
    method: null,
    blockLength: result.blockLength,
  };
}

// --- Reading a summary -----------------------------------------------------------------------------

export type McStats = {
  returnPct: Quantiles;
  drawdownPct: Quantiles;
  /** Share (0-100) of runs that end with a gain, that fall RUIN_DRAWDOWN_PCT or more, and that lose a tenth or more. */
  probProfit: number;
  probRuin: number;
  probLossTenth: number;
  /** Mean return of the worst 5 % of the runs (a bad-luck scenario). */
  worstTailPct: number;
  /** Mean return of all runs. */
  meanReturnPct: number;
  /** Where the real result falls among the runs' returns (0-100): high = it had better luck than most. */
  realRank: number;
};

export function mcStats(summary: McSummary, upTo = summary.returns.length): McStats {
  const returns = summary.returns.slice(0, upTo);
  const drawdowns = summary.drawdowns.slice(0, upTo);
  const sorted = sortedCopy(returns);
  const tail = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.05)));
  const share = (count: number) => (returns.length === 0 ? 0 : (count / returns.length) * 100);
  return {
    returnPct: quantilesOf(returns),
    drawdownPct: quantilesOf(drawdowns),
    probProfit: share(returns.filter((r) => r > 0).length),
    probRuin: share(drawdowns.filter((d) => d >= RUIN_DRAWDOWN_PCT).length),
    probLossTenth: share(returns.filter((r) => r <= -10).length),
    worstTailPct: tail.reduce((sum, v) => sum + v, 0) / tail.length,
    meanReturnPct: returns.length === 0 ? 0 : returns.reduce((sum, v) => sum + v, 0) / returns.length,
    realRank: rankOf(returns, summary.real.returnPct),
  };
}

export type Histogram = { lo: number; hi: number; bins: number };

/** Fixed range of the histogram of final returns, wide enough for every run and for the real one. */
export function histogramDomain(summary: McSummary, bins = 28): Histogram {
  const all = [...summary.returns, summary.real.returnPct, 0];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  return { lo: lo - pad, hi: hi + pad, bins };
}

/** Runs per bin among the first `upTo` runs. */
export function histogramAt(returns: number[], domain: Histogram, upTo = returns.length): number[] {
  const counts = new Array<number>(domain.bins).fill(0);
  const width = (domain.hi - domain.lo) / domain.bins;
  for (let i = 0; i < Math.min(upTo, returns.length); i++) {
    const bin = Math.min(domain.bins - 1, Math.max(0, Math.floor((returns[i] - domain.lo) / width)));
    counts[bin]++;
  }
  return counts;
}

/** The last checkpoint whose runs have all been drawn by the time `runsSeen` runs are in. */
export function checkpointAt(summary: McSummary, runsSeen: number): { runs: number; bands: McBands } {
  let current = summary.checkpoints[0] ?? { runs: summary.runs, bands: summary.bands };
  for (const checkpoint of summary.checkpoints) if (checkpoint.runs <= runsSeen) current = checkpoint;
  return current;
}

const lerpBands = (a: McBands, b: McBands, u: number): McBands => {
  const mix = (x: number[], y: number[]) => x.map((v, i) => v + (y[i] - v) * u);
  return { p5: mix(a.p5, b.p5), p25: mix(a.p25, b.p25), p50: mix(a.p50, b.p50), p75: mix(a.p75, b.p75), p95: mix(a.p95, b.p95) };
};

/** Bands once `runsSeen` runs are in, gliding between two checkpoints so they settle smoothly. */
export function bandsAtRuns(summary: McSummary, runsSeen: number): McBands {
  const { checkpoints } = summary;
  if (checkpoints.length === 0) return summary.bands;
  if (runsSeen <= checkpoints[0].runs) return checkpoints[0].bands;
  for (let i = 1; i < checkpoints.length; i++) {
    const [a, b] = [checkpoints[i - 1], checkpoints[i]];
    if (runsSeen <= b.runs) return lerpBands(a.bands, b.bands, (runsSeen - a.runs) / Math.max(1, b.runs - a.runs));
  }
  return checkpoints[checkpoints.length - 1].bands;
}

// --- Verdict ----------------------------------------------------------------------------------------

export type McCriterion = { id: "profit" | "tail" | "drawdown" | "luck" | "order"; tone: Tone; value: number };

export type McReport = {
  score: number;
  tone: Tone;
  headline: "solid" | "decent" | "risky" | "losing";
  criteria: McCriterion[];
  stats: McStats;
};

const higher = (value: number, good: number, mixed: number): Tone => (value >= good ? "good" : value >= mixed ? "mixed" : "bad");
const lower = (value: number, good: number, mixed: number): Tone => (value <= good ? "good" : value <= mixed ? "mixed" : "bad");
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const POINTS: Record<Tone, number> = { good: 1, mixed: 0.55, bad: 0.1 };

/**
 * Mixing only the order keeps every trade, so the result never changes: what is judged is whether
 * the trades add up to a gain and how much worse than the real one a bad order can fall.
 */
function shuffleReport(summary: McSummary, stats: McStats): McReport {
  const gain = summary.real.returnPct;
  const worse = stats.drawdownPct.p95 / Math.max(1, summary.real.maxDrawdownPct);
  const criteria: McCriterion[] = [
    { id: "profit", tone: gain > 0 ? "good" : "bad", value: gain },
    { id: "drawdown", tone: lower(stats.drawdownPct.p95, 30, 50), value: stats.drawdownPct.p95 },
    { id: "order", tone: lower(worse, 1.5, 2.5), value: worse },
  ];
  const parts = [gain > 0 ? 1 : 0, clamp01(1 - stats.drawdownPct.p95 / 70), clamp01(1 - (worse - 1) / 3)];
  const weights = [0.3, 0.4, 0.3];
  const score = Math.round(criteria.reduce((sum, c, i) => sum + weights[i] * (0.5 * POINTS[c.tone] + 0.5 * parts[i]), 0) * 100);
  const tone: Tone = score >= 70 ? "good" : score >= 45 ? "mixed" : "bad";
  return { score, tone, headline: gain <= 0 ? "losing" : tone === "good" ? "solid" : tone === "mixed" ? "decent" : "risky", criteria, stats };
}

/**
 * A traffic light per question a person asks of a Monte Carlo run: does it win most of the time,
 * how bad is bad luck, how deep can it fall, and (paths only) was the real result just luck.
 */
export function mcReport(summary: McSummary): McReport {
  const stats = mcStats(summary);
  if (summary.method === "shuffle") return shuffleReport(summary, stats);
  const criteria: McCriterion[] = [
    { id: "profit", tone: higher(stats.probProfit, 70, 55), value: stats.probProfit },
    { id: "tail", tone: higher(stats.returnPct.p5, -10, -30), value: stats.returnPct.p5 },
    { id: "drawdown", tone: lower(stats.drawdownPct.p95, 30, 50), value: stats.drawdownPct.p95 },
  ];
  if (summary.source === "paths") criteria.push({ id: "luck", tone: lower(stats.realRank, 85, 95), value: stats.realRank });
  const weights = criteria.map((c) => (c.id === "profit" ? 0.4 : c.id === "luck" ? 0.15 : c.id === "tail" ? 0.25 : 0.2));
  const total = weights.reduce((a, b) => a + b, 0);
  const continuous = [clamp01(stats.probProfit / 100), clamp01((stats.returnPct.p5 + 50) / 60), clamp01(1 - stats.drawdownPct.p95 / 70), ...(summary.source === "paths" ? [clamp01(1 - Math.max(0, stats.realRank - 50) / 50)] : [])];
  const score = Math.round(
    (criteria.reduce((sum, c, i) => sum + weights[i] * (0.5 * POINTS[c.tone] + 0.5 * continuous[i]), 0) / total) * 100
  );
  const tone: Tone = score >= 70 ? "good" : score >= 45 ? "mixed" : "bad";
  const headline = stats.probProfit < 40 ? "losing" : tone === "good" ? "solid" : tone === "mixed" ? "decent" : "risky";
  return { score, tone, headline, criteria, stats };
}
