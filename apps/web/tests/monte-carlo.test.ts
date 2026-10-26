import assert from "node:assert/strict";
import { test } from "node:test";

import type { McPathsBatchResult } from "../src/lib/backtests.ts";
import {
  bandsAtRuns,
  checkpointAt,
  compound,
  histogramAt,
  histogramDomain,
  mcReport,
  mcStats,
  mulberry32,
  percentileOfSorted,
  quantilesOf,
  rankOf,
  resampleTrades,
  spacedIndices,
  summarizePaths,
  tradeFactors,
} from "../src/lib/monte-carlo.ts";
import { MC_PATHS_UNITS, mcDefaultBlock, mcMaxPathsFor, mcPathsProblem } from "../src/lib/robustness-plan.ts";
import { parseBatchBody } from "../src/lib/server/batch-input.ts";

const PNLS = [50, -20, 30, -10, 80, -40, 25, 15, -30, 60, -5, 45];

test("the same seed gives the same numbers and another seed does not", () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(mulberry32(7)(), mulberry32(8)());
  const draw = mulberry32(1);
  for (let i = 0; i < 1000; i++) {
    const x = draw();
    assert.ok(x >= 0 && x < 1);
  }
});

test("percentiles of a known case follow numpy's interpolation", () => {
  const values = Array.from({ length: 101 }, (_, i) => i);
  assert.deepEqual(quantilesOf(values), { p5: 5, p25: 25, p50: 50, p75: 75, p95: 95 });
  assert.equal(percentileOfSorted([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentileOfSorted([10], 95), 10);
  assert.equal(rankOf([1, 2, 3, 4], 2), 50);
});

test("trade profits compound over the equity at their entry", () => {
  const factors = tradeFactors([100, -550, 0], 1000);
  assert.deepEqual(factors.map((f) => Math.round(f * 1e6) / 1e6), [1.1, 0.5, 1]);
  const { curve, maxDrawdownPct } = compound(factors);
  assert.equal(Math.round(curve[3] * 1e6) / 1e6, 55);
  assert.equal(Math.round(maxDrawdownPct * 1e6) / 1e6, 50);
});

const input = { pnls: PNLS, initialCapital: 1000, runs: 200, seed: 42 };

test("resampling the trades is deterministic", () => {
  assert.deepEqual(resampleTrades({ ...input, method: "resample" }), resampleTrades({ ...input, method: "resample" }));
  assert.notDeepEqual(resampleTrades({ ...input, method: "resample" }).returns, resampleTrades({ ...input, method: "resample", seed: 43 }).returns);
});

test("mixing the order keeps the final result and changes the drawdown", () => {
  const out = resampleTrades({ ...input, method: "shuffle" });
  for (const r of out.returns) assert.ok(Math.abs(r - out.real.returnPct) < 0.02, `${r} vs ${out.real.returnPct}`);
  assert.ok(new Set(out.drawdowns).size > 5);
  assert.ok(Math.min(...out.drawdowns) <= out.real.maxDrawdownPct && Math.max(...out.drawdowns) >= out.real.maxDrawdownPct);
});

test("drawing the trades again spreads the result around the real one", () => {
  const out = resampleTrades({ ...input, runs: 1000, method: "resample" });
  assert.equal(out.source, "trades");
  assert.equal(out.runs, 1000);
  assert.equal(out.returns.length, 1000);
  assert.ok(out.samples.length === 40 && out.samples.every((s) => s.length === out.real.curve.length));
  assert.ok(out.real.curve[0] === 100 && out.samples.every((s) => s[0] === 100));
  const stats = mcStats(out);
  assert.ok(stats.returnPct.p5 < stats.returnPct.p50 && stats.returnPct.p50 < stats.returnPct.p95);
  // The real result is a typical draw: its rank is not at the edge.
  assert.ok(stats.realRank > 10 && stats.realRank < 90);
  // The bands are ordered at every point and the last checkpoint is the final bands.
  const { p5, p25, p50, p75, p95 } = out.bands;
  p5.forEach((_, i) => assert.ok(p5[i] <= p25[i] && p25[i] <= p50[i] && p50[i] <= p75[i] && p75[i] <= p95[i]));
  assert.deepEqual(out.checkpoints.at(-1)?.bands, out.bands);
  assert.equal(out.checkpoints.at(-1)?.runs, 1000);
});

test("a sequence of only winners gives probability one and a clean verdict", () => {
  const out = resampleTrades({ pnls: [10, 20, 15, 30, 25], initialCapital: 1000, runs: 100, method: "resample", seed: 1 });
  const stats = mcStats(out);
  assert.equal(stats.probProfit, 100);
  assert.equal(stats.probRuin, 0);
  assert.equal(mcReport(out).headline, "solid");
  const losing = mcReport(resampleTrades({ pnls: [-30, -20, 5, -40], initialCapital: 1000, runs: 100, method: "resample", seed: 1 }));
  assert.equal(losing.headline, "losing");
  assert.equal(losing.tone, "bad");
});

test("the histogram keeps every run and a fixed domain", () => {
  const out = resampleTrades({ ...input, method: "resample" });
  const domain = histogramDomain(out);
  const all = histogramAt(out.returns, domain);
  assert.equal(all.reduce((a, b) => a + b, 0), 200);
  assert.equal(histogramAt(out.returns, domain, 50).reduce((a, b) => a + b, 0), 50);
  assert.ok(domain.lo <= Math.min(...out.returns, 0) && domain.hi >= Math.max(...out.returns, 0));
});

test("evenly spaced indices include both ends", () => {
  assert.deepEqual(spacedIndices(5, 160), [0, 1, 2, 3, 4]);
  const spaced = spacedIndices(1000, 160);
  assert.equal(spaced.length, 160);
  assert.equal(spaced[0], 0);
  assert.equal(spaced.at(-1), 999);
});

test("the engine's aggregated answer reads as a summary", () => {
  const curve = [100, 101, 103];
  const bands = { p5: [100, 95, 90], p25: [100, 98, 97], p50: [100, 101, 103], p75: [100, 104, 108], p95: [100, 107, 115] };
  const result: McPathsBatchResult = {
    kind: "mc-paths",
    runs: 4,
    blockLength: 5,
    seed: 3,
    candleCount: 120,
    real: { returnPct: 3, benchmarkReturnPct: 1, maxDrawdownPct: 2, curve },
    samples: [curve],
    bands,
    checkpoints: [
      { runs: 2, bands },
      { runs: 4, bands },
    ],
    returns: [-10, 2, 5, 15],
    drawdowns: [20, 5, 3, 2],
    beatHoldPct: 50,
  };
  const summary = summarizePaths(result);
  assert.equal(summary.source, "paths");
  assert.equal(summary.length, 120);
  const stats = mcStats(summary);
  assert.equal(stats.probProfit, 75);
  assert.equal(stats.realRank, 50);
  assert.equal(checkpointAt(summary, 3).runs, 2);
  assert.equal(checkpointAt(summary, 4).runs, 4);
  assert.equal(checkpointAt(summary, 0).runs, 2);
  assert.deepEqual(bandsAtRuns(summary, 3), bands);
  const grown = { ...summary, checkpoints: [{ runs: 2, bands }, { runs: 4, bands: { ...bands, p50: [100, 111, 113] } }] };
  assert.deepEqual(bandsAtRuns(grown, 3).p50, [100, 106, 108]);
  assert.deepEqual(bandsAtRuns(grown, 99).p50, [100, 111, 113]);
  assert.equal(mcReport(summary).criteria.length, 4);
});

// The same expectations as `apps/api/tests/test_montecarlo.py`.
test("the plan of a synthetic-paths run mirrors the engine", () => {
  assert.equal(mcDefaultBlock(10_000), 100);
  assert.equal(mcDefaultBlock(30), 5);
  assert.equal(mcDefaultBlock(2), 2);
  assert.equal(mcPathsProblem("2024-01-01", "2024-01-10", "1d", 100), "too_short");
  assert.equal(mcPathsProblem("2024-01-01", "2024-06-30", "1d", 100), null);
  assert.equal(mcPathsProblem("2020-01-01", "2024-06-30", "1h", 50), "too_much");
  assert.equal(mcMaxPathsFor("2024-01-01", "2024-06-30", "1d"), 1000);
  assert.equal(mcMaxPathsFor("2020-01-01", "2024-06-30", "1h"), 25);
});

test("a synthetic-paths request costs a fixed number of backtests", () => {
  const strategy = { name: "x", initialCapital: 1000, feePct: 0.1, rules: [] };
  const body = { kind: "mc-paths", symbol: "btc", timeframe: "1d", from: "2024-01-01", to: "2024-06-30", strategy, paths: 100 };
  const parsed = parseBatchBody(body);
  assert.equal(parsed?.units, MC_PATHS_UNITS);
  assert.equal(parseBatchBody({ ...body, paths: 1000 })?.units, MC_PATHS_UNITS);
  assert.equal(parsed?.paths, 100);
  assert.equal((parsed?.forward as { symbol: string }).symbol, "BTC");
  assert.equal(parseBatchBody({ ...body, paths: 5 }), null);
  assert.equal(parseBatchBody({ ...body, paths: 1001 }), null);
  assert.equal(parseBatchBody({ ...body, blockLength: 0 }), null);
  assert.equal(parseBatchBody({ ...body, seed: -1 }), null);
  assert.equal(parseBatchBody({ ...body, from: "2024-06-01", to: "2024-06-10" }), null);
  assert.equal(parseBatchBody({ ...body, timeframe: "1h", from: "2020-01-01", paths: 50 }), null);
});
