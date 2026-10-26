import assert from "node:assert/strict";
import { test } from "node:test";

import { batchCsv, batchRows, batchSummary, consistency, ranksOf, returnPctOf, seriesOf, smoothRanks, sortRows, valueAt } from "../src/lib/batch-report.ts";
import type { BacktestResult, BatchItem, AssetsBatchResult } from "../src/lib/backtests.ts";

const day = (n: number) => new Date(Date.UTC(2024, 0, 1 + n)).toISOString();

function item(symbol: string, returnPct: number, benchmarkReturnPct: number, opts: { start?: number; days?: number } = {}): BatchItem {
  const { start = 0, days = 5 } = opts;
  const capital = 1000;
  const candles = Array.from({ length: days }, (_, i) => ({ time: day(start + i), open: 1, high: 1, low: 1, close: 1 }));
  const equity = candles.map((_, i) => capital * (1 + ((returnPct / 100) * (i + 1)) / days));
  const result = {
    candles,
    equity,
    stats: { returnPct, benchmarkReturnPct, maxDrawdownPct: 5, winRatePct: 50, sharpe: 1, trades: 4, finalCapital: 1000 + returnPct * 10 },
    metrics: { exposurePct: 40, profitFactor: 1.5 },
  } as unknown as BacktestResult;
  return { symbol, result, error: null, startsAt: day(start) };
}
const failed = (symbol: string): BatchItem => ({ symbol, result: null, error: "no-candles", startsAt: null });
const batch = (...items: BatchItem[]): AssetsBatchResult => ({ kind: "assets", items });

test("summary counts profitable assets, those beating buy and hold and late starts", () => {
  const s = batchSummary(batch(item("A", 20, 10), item("B", -5, -10), item("C", 8, 30, { start: 3 }), failed("D")), day(0));
  assert.equal(s.total, 4);
  assert.equal(s.ran, 3);
  assert.equal(s.failed, 1);
  assert.equal(s.profitable, 2);
  assert.equal(s.beatsHold, 2);
  assert.equal(s.lateStarts, 1);
  assert.equal(s.best?.symbol, "A");
  assert.equal(s.worst?.symbol, "B");
  assert.equal(s.medianReturnPct, 8);
  assert.ok(Math.abs((s.meanReturnPct ?? 0) - 23 / 3) < 1e-9);
});

test("consistency verdict grades by the share of profitable assets", () => {
  const make = (returns: [number, number][]) =>
    consistency(batchSummary(batch(...returns.map(([r, b], i) => item(`S${i}`, r, b))), day(0)));
  assert.equal(make([[10, 5], [12, 5], [8, 5], [9, 5], [-1, 5]]).headline, "consistent");
  assert.equal(make([[10, 50], [12, 50], [8, 50], [-9, 5], [-1, 5]]).headline, "mostly");
  assert.equal(make([[10, 5], [12, 5], [-8, 5], [-9, 5]]).headline, "mixed");
  assert.equal(make([[10, 5], [-12, 5], [-8, 5], [-9, 5]]).headline, "fragile");
  const lost = make([[-1, 5], [-12, 5], [-8, 5], [-9, 5], [-3, 5]]);
  assert.equal(lost.headline, "loses");
  assert.equal(lost.tone, "bad");
  const none = consistency(batchSummary(batch(failed("A"), failed("B")), day(0)));
  assert.equal(none.headline, "none");
  assert.equal(make([[10, 5], [12, 5]]).smallSample, true);
});

test("sorting puts failed assets last and keeps ties in request order", () => {
  const rows = batchRows(batch(failed("X"), item("A", 5, 1), item("B", 9, 1), item("C", 5, 1)));
  assert.deepEqual(sortRows(rows, "returnPct", "desc").map((r) => r.symbol), ["B", "A", "C", "X"]);
  assert.deepEqual(sortRows(rows, "returnPct", "asc").map((r) => r.symbol), ["A", "C", "B", "X"]);
  assert.deepEqual(sortRows(rows, "symbol", "asc").map((r) => r.symbol), ["A", "B", "C", "X"]);
});

test("a series has no value before it starts and holds its last value after", () => {
  const s = seriesOf(item("A", 10, 0, { start: 2, days: 4 }))!;
  assert.equal(valueAt(s, Date.parse(day(1))), null);
  assert.equal(valueAt(s, Date.parse(day(2))), 1025);
  assert.equal(valueAt(s, Date.parse(day(4))), 1075);
  assert.equal(valueAt(s, Date.parse(day(100))), 1100);
  assert.equal(returnPctOf(1100, 1000).toFixed(6), "10.000000");
  assert.equal(seriesOf(failed("Z")), null);
});

test("ranks put the highest first and the missing last", () => {
  assert.deepEqual(ranksOf([5, null, 9, 5]), [1, 3, 0, 2]);
});

test("smoothed ranks glide between positions and match the plain ranks when nothing moves", () => {
  // A leads until pos 5, then B overtakes it.
  const values = (pos: number) => [pos < 5 ? 10 : 0, pos < 5 ? 0 : 10];
  assert.deepEqual(smoothRanks(values, 2, 1), [0, 1]);
  assert.deepEqual(smoothRanks(values, 9, 1), [1, 0]);
  const mid = smoothRanks(values, 5.5, 1);
  assert.ok(mid[0] > 0 && mid[0] < 1);
  assert.ok(Math.abs(mid[0] + mid[1] - 1) < 1e-9);
  // Pure: the same position always gives the same answer.
  assert.deepEqual(smoothRanks(values, 5.5, 1), mid);
});

test("the CSV follows the language conventions and leaves failed assets empty", () => {
  const rows = batchRows(batch(item("A", 12.5, 3), failed("B")));
  const es = batchCsv(rows, "es", ["Activo", "Estrategia"]).split("\r\n");
  assert.equal(es[0], "﻿Activo;Estrategia");
  assert.ok(es[1].startsWith("A;12,50;3,00;9,50;5,00;50,0;1,00;4;1125,00;1,50;40,0;2024-01-01"));
  assert.equal(es[2], "B;;;;;;;;;;;");
  const en = batchCsv(rows, "en", ["Asset"]).split("\r\n");
  assert.ok(en[1].startsWith("A,12.50,3.00,9.50"));
});

test("summary averages the risk figures and names the steadiest assets", () => {
  const s = batchSummary(batch(item("A", 20, 10), item("B", -5, -10), failed("C")), day(0));
  assert.equal(s.meanDrawdownPct, 5);
  assert.equal(s.meanWinRatePct, 50);
  assert.equal(s.meanSharpe, 1);
  assert.equal(s.meanExposurePct, 40);
  assert.equal(s.totalOrders, 8);
  assert.equal(s.bestSharpe?.sharpe, 1);
  const none = batchSummary(batch(failed("A")), day(0));
  assert.equal(none.meanDrawdownPct, null);
  assert.equal(none.bestSharpe, null);
  const row = batchRows(batch(item("A", 20, 10)))[0];
  assert.deepEqual([row.finalCapital, row.profitFactor, row.exposurePct], [1200, 1.5, 40]);
});
