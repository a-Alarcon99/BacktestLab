import assert from "node:assert/strict";
import { test } from "node:test";

import {
  axisProfiles,
  cellReveal,
  curveUpTo,
  curveValueAt,
  fanOf,
  marksUpTo,
  rankedCells,
  resample,
  revealOrder,
  scoreTone,
  sensitivityReport,
  sensitivityStats,
  tableCsv,
  timeframesExtra,
  timeframesReport,
  windowLanes,
  windowProgress,
  windowsExtra,
  windowsReport,
} from "../src/lib/robustness-report.ts";
import type { RunSummary, SensitivityBatchResult, TimeframesBatchResult, WindowsBatchResult } from "../src/lib/backtests.ts";

const summary = (returnPct: number, benchmarkReturnPct = 0, maxDrawdownPct = 10): RunSummary => ({
  returnPct,
  benchmarkReturnPct,
  maxDrawdownPct,
  orders: 4,
  roundTrips: 2,
  winRatePct: 50,
  sharpe: 1,
  candleCount: 60,
  finalCapital: 1000 + returnPct * 10,
  profitFactor: 1.5,
  exposurePct: 40,
  avgTradePct: 2,
  bestTradePct: 8,
  worstTradePct: -3,
  curve: [100, 100 + returnPct],
  benchmarkCurve: [100, 100 + benchmarkReturnPct],
  drawdownCurve: [0, maxDrawdownPct],
  marks: [],
});

const day = (n: number) => new Date(Date.UTC(2024, 0, 1 + n)).toISOString().slice(0, 10);

function windows(returns: (number | null)[], opts: { hold?: number; drawdown?: number } = {}): WindowsBatchResult {
  return {
    kind: "windows",
    lengthDays: 30,
    stepDays: 30,
    prices: [],
    items: returns.map((r, i) => ({
      start: day(i * 30),
      end: day(i * 30 + 29),
      summary: r === null ? null : summary(r, opts.hold ?? 0, opts.drawdown ?? 10),
      error: r === null ? "no-candles" : null,
    })),
  };
}

test("windows that mostly win are consistent and score high", () => {
  const report = windowsReport(windows([12, 8, 15, -3, 9, 11, 7, 5]));
  assert.equal(report.positive, 7);
  assert.equal(report.ran, 8);
  assert.equal(report.headline, "consistent");
  assert.equal(report.tone, "good");
  assert.ok(report.score >= 70);
  assert.equal(report.worst?.index, 3);
  assert.equal(report.best?.index, 2);
  assert.equal(report.criteria.find((c) => c.id === "positive")?.tone, "good");
});

test("windows that mostly lose are not consistent", () => {
  const report = windowsReport(windows([-10, -20, 5, -15, -8, -30], { drawdown: 40 }));
  assert.equal(report.tone, "bad");
  assert.ok(["fragile", "loses"].includes(report.headline));
  assert.ok(report.score < 45);
});

test("windows without candles are left out of the figures", () => {
  const report = windowsReport(windows([null, 10, null, 5]));
  assert.equal(report.total, 4);
  assert.equal(report.ran, 2);
  assert.equal(report.smallSample, true);
  assert.equal(windowsReport(windows([null, null])).headline, "none");
  assert.equal(windowsReport(windows([null, null])).score, 0);
});

test("lanes keep overlapping windows apart", () => {
  const items = [
    { start: "2024-01-01", end: "2024-01-10" },
    { start: "2024-01-06", end: "2024-01-15" },
    { start: "2024-01-11", end: "2024-01-20" },
    { start: "2024-01-21", end: "2024-01-30" },
  ];
  assert.deepEqual(windowLanes(items), [0, 1, 0, 0]);
});

test("a window is drawn as the timeline passes through it", () => {
  const w = { start: "2024-01-01", end: "2024-01-10" };
  assert.equal(windowProgress(w, Date.parse("2023-12-31")), 0);
  assert.equal(windowProgress(w, Date.parse("2024-01-06")), 0.5);
  assert.equal(windowProgress(w, Date.parse("2024-02-01")), 1);
});

// Axes of five values; the original variant sits at [2, 2].
function grid(returnFor: (r: number, c: number) => number | null): SensitivityBatchResult {
  const levels = [-0.2, -0.1, 0, 0.1, 0.2];
  const axis = (id: string) => ({ id, kind: "rsi", field: "period", ruleIndex: 0, conditionIndex: 0, base: 14, values: [11, 13, 14, 15, 17], levels });
  const cells: SensitivityBatchResult["cells"] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const v = returnFor(r, c);
      cells.push({ coords: [r, c], values: [r, c], summary: v === null ? null : summary(v), error: v === null ? "conflict" : null });
    }
  return { kind: "sensitivity", axes: [axis("0:0:period"), axis("0:0:value")], cells };
}

test("a plateau is robust", () => {
  const report = sensitivityReport(grid(() => 20));
  assert.equal(report.headline, "plateau");
  assert.equal(report.tone, "good");
  assert.equal(report.retention, 1);
  assert.equal(report.profitable, 25);
});

test("an isolated peak is overfitting", () => {
  const report = sensitivityReport(grid((r, c) => (r === 2 && c === 2 ? 60 : -5)));
  assert.equal(report.headline, "peak");
  assert.notEqual(report.tone, "good");
  assert.ok(report.retention !== null && report.retention < 0);
  assert.equal(report.criteria.find((c) => c.id === "plateau")?.tone, "bad");
});

test("skipped variants are counted and do not break the report", () => {
  const report = sensitivityReport(grid((r) => (r === 0 ? null : 10)));
  assert.equal(report.skipped, 5);
  assert.equal(report.ran, 20);
  assert.equal(sensitivityReport(grid(() => null)).headline, "none");
});

test("when the original loses there is no plateau to speak of", () => {
  const report = sensitivityReport(grid(() => -8));
  assert.equal(report.retention, null);
  assert.equal(report.headline, "weak");
  assert.equal(report.tone, "bad");
});

test("cells fill in rippling out from the original, each on its own turn", () => {
  const cells = grid(() => 1).cells;
  const order = revealOrder(cells);
  assert.equal(cells[order[0]].coords.join(), "2,2");
  assert.equal(order.length, 25);
  assert.equal(new Set(order).size, 25);
  // The four direct neighbours come before the corners.
  const rank = (r: number, c: number) => order.indexOf(cells.findIndex((x) => x.coords[0] === r && x.coords[1] === c));
  assert.ok(rank(2, 3) < rank(3, 3));
  assert.equal(cellReveal(0, 25, 0), 0);
  assert.equal(cellReveal(24, 25, 1), 1);
  assert.equal(cellReveal(12, 25, 0.5), 0.5);
  assert.equal(cellReveal(10, 25, 0.5), 1);
});

function frames(items: [string, number | null][], hold = 0): TimeframesBatchResult {
  return { kind: "timeframes", items: items.map(([timeframe, r]) => ({ timeframe: timeframe as never, summary: r === null ? null : summary(r, hold), error: r === null ? "no-candles" : null, startsAt: null })) };
}

test("timeframes that hold up are consistent", () => {
  const report = timeframesReport(frames([["1h", 12], ["2h", 9], ["4h", 15], ["1d", 7], ["1w", 4]]), "4h");
  assert.equal(report.headline, "consistent");
  assert.equal(report.tone, "good");
  assert.equal(report.bestTimeframe, "4h");
  assert.equal(report.chosenReturnPct, 15);
  assert.equal(report.spreadPts, 11);
});

test("a result that only exists on the chosen timeframe is flagged", () => {
  const report = timeframesReport(frames([["1h", -9], ["2h", -4], ["4h", 22], ["1d", -12], ["1w", -3]]), "4h");
  assert.equal(report.headline, "lonely");
  assert.notEqual(report.tone, "good");
});

test("score tones", () => {
  assert.equal(scoreTone(70), "good");
  assert.equal(scoreTone(69), "mixed");
  assert.equal(scoreTone(45), "mixed");
  assert.equal(scoreTone(44), "bad");
});

test("a curve is drawn up to the progress, the last point gliding", () => {
  const curve = [100, 110, 120, 130];
  assert.deepEqual(curveUpTo(curve, 0), [100]);
  assert.deepEqual(curveUpTo(curve, 1), curve);
  assert.deepEqual(curveUpTo(curve, 0.5), [100, 110, 115]);
  assert.deepEqual(curveUpTo([], 0.5), []);
});

test("CSV uses the language's separators and keeps integers whole", () => {
  assert.equal(tableCsv(["a", "b"], [["x", 1.5], ["y", null], ["z", 3]], "es"), "﻿a;b\r\nx;1,50\r\ny;\r\nz;3\r\n");
  assert.equal(tableCsv(["a", "b"], [["x,y", 1.5]], "en"), '﻿a,b\r\n"x,y",1.50\r\n');
});

test("a fan is the median and the quartiles of the curves, point by point", () => {
  const fan = fanOf([[100, 110], [100, 120], [100, 130], [100, 140], [100, 150]], 2);
  assert.deepEqual(fan.median, [100, 130]);
  assert.deepEqual(fan.lower, [100, 120]);
  assert.deepEqual(fan.upper, [100, 140]);
  assert.deepEqual(fanOf([]).median, []);
  assert.deepEqual(resample([0, 10], 5), [0, 2.5, 5, 7.5, 10]);
});

test("marks count by the point of the run they are at", () => {
  const marks = [{ at: 0.1, side: "buy" as const }, { at: 0.4, side: "sell" as const }, { at: 0.8, side: "buy" as const }];
  assert.deepEqual(marksUpTo(marks, 0.5), { buys: 1, sells: 1 });
  assert.deepEqual(marksUpTo(marks, 1), { buys: 2, sells: 1 });
  assert.deepEqual(marksUpTo(marks, 0), { buys: 0, sells: 0 });
});

test("window extras: spread, the longest losing run and averages", () => {
  const extra = windowsExtra(windows([5, -2, -4, null, -1, 8]));
  assert.equal(extra.losingStreak, 3);
  assert.equal(extra.meanReturnPct, 1.2);
  assert.ok((extra.stdevReturnPct ?? 0) > 0);
  assert.equal(extra.avgOrders, 4);
  assert.equal(windowsExtra(windows([null])).meanReturnPct, null);
});

function fullGrid(returns: (number | null)[][]): SensitivityBatchResult {
  return {
    kind: "sensitivity",
    axes: [
      { id: "0:0:period", kind: "rsi", field: "period", ruleIndex: 0, conditionIndex: 0, base: 14, values: [11, 13, 14, 15, 17], levels: [-0.2, -0.1, 0, 0.1, 0.2] },
      { id: "0:0:value", kind: "rsi", field: "value", ruleIndex: 0, conditionIndex: 0, base: 35, values: [28, 31.5, 35, 38.5, 42], levels: [-0.2, -0.1, 0, 0.1, 0.2] },
    ],
    cells: returns.flatMap((row, r) => row.map((v, c) => ({ coords: [r, c], values: [0, 0], summary: v === null ? null : summary(v), error: v === null ? ("conflict" as const) : null }))),
  };
}

test("sensitivity statistics and the profile along each axis", () => {
  const result = fullGrid([
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5],
    [10, 20, 30, 40, 50],
    [1, 2, 3, 4, 5],
    [1, 2, 3, null, 5],
  ]);
  const stats = sensitivityStats(result);
  assert.ok(stats);
  assert.equal(stats.max, 50);
  assert.equal(stats.min, 1);
  assert.equal(stats.spread, 49);
  const [rows, cols] = axisProfiles(result);
  assert.equal(rows.points[2].mean, 30); // the middle row averages 10..50
  assert.equal(rows.points[0].max, 5);
  assert.equal(cols.points[3].min, 4); // the skipped cell is ignored
  assert.equal(cols.points[3].max, 40);
  const { best, worst } = rankedCells(result, 2);
  assert.deepEqual(best, [14, 13]);
  assert.equal(result.cells[worst[0]].summary?.returnPct, 1);
});

test("the timeframe with the best Sharpe, the shallowest fall and the most orders", () => {
  const a = summary(10, 0, 30);
  const b = { ...summary(5, 0, 8), sharpe: 2.4, orders: 20 };
  const result: TimeframesBatchResult = {
    kind: "timeframes",
    items: [
      { timeframe: "1h", summary: a, error: null, startsAt: null },
      { timeframe: "4h", summary: b, error: null, startsAt: null },
      { timeframe: "1d", summary: null, error: "no-candles", startsAt: null },
    ],
  };
  assert.deepEqual(timeframesExtra(result), { bestSharpe: "4h", lowestDrawdown: "4h", mostOrders: "4h" });
});

test("a curve is read at any point of its run, interpolated", () => {
  assert.equal(curveValueAt([100, 110, 130], 0.25), 105);
  assert.equal(curveValueAt([100, 110, 130], 1), 130);
  assert.equal(curveValueAt([100, 110, 130], 5), 130);
  assert.equal(curveValueAt([], 0.5), null);
  assert.equal(curveValueAt([42], 0.5), 42);
});
