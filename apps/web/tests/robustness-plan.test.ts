import assert from "node:assert/strict";
import { test } from "node:test";

import { fitValue, valuesFromEdits, candlesPerDays, chosenTimeframes, engineCandles, neighborTimeframes, timeframeFits, sensitivityCells, sensitivityParams, windowBounds, windowCount } from "../src/lib/robustness-plan.ts";
import type { Strategy } from "../src/lib/strategy.ts";

// The expectations below are the same ones `apps/api/tests/test_robustness.py` checks: the web
// app prices a request with these functions and the engine runs it with their Python twins.

test("windows fit inside the range, inclusive of both ends", () => {
  assert.deepEqual(windowBounds("2024-01-01", "2024-01-31", 10, 10), [
    { start: "2024-01-01", end: "2024-01-10" },
    { start: "2024-01-11", end: "2024-01-20" },
    { start: "2024-01-21", end: "2024-01-30" },
  ]);
  assert.equal(windowCount("2024-01-01", "2024-01-31", 10, 10), 3);
  assert.equal(windowCount("2024-01-01", "2024-01-05", 10, 1), 0);
  assert.equal(windowCount("2024-01-01", "2024-01-10", 10, 1), 1);
  // 2024-01-01 .. 2024-06-30 is 182 days: 60-day windows every 30 days.
  assert.equal(windowCount("2024-01-01", "2024-06-30", 60, 30), 5);
});

test("the count matches the bounds for any step", () => {
  for (const [length, step] of [[7, 1], [30, 7], [90, 45], [365, 365]]) {
    assert.equal(windowBounds("2023-03-05", "2024-09-20", length, step).length, windowCount("2023-03-05", "2024-09-20", length, step));
  }
});

test("neighbours follow the timeframe order and the range", () => {
  assert.deepEqual(neighborTimeframes("4h", "2024-01-01", "2024-06-30"), ["1h", "2h", "4h", "1d", "1w"]);
  // A short range leaves the weekly candles out (fewer than the minimum).
  assert.deepEqual(neighborTimeframes("4h", "2024-01-01", "2024-01-20"), ["1h", "2h", "4h", "1d"]);
  // Too long for the finer ones.
  assert.deepEqual(neighborTimeframes("1h", "2023-01-01", "2024-12-31", 20_000), ["1h", "2h", "4h"]);
});

test("candles are counted the way the engine does", () => {
  assert.equal(engineCandles("2024-01-01", "2024-01-02", "1d"), 2);
  assert.equal(engineCandles("2024-01-01", "2024-01-01", "1h"), 24);
  assert.equal(candlesPerDays(60, "1d"), 60);
});

test("a grid has five levels per varied parameter", () => {
  assert.equal(sensitivityCells(1), 5);
  assert.equal(sensitivityCells(2), 25);
});

const strategy = {
  rules: [
    { id: "b", side: "buy", conditions: [{ kind: "rsi", period: 14, op: "below", value: 35 }], size: { unit: "pct", value: 100 } },
    {
      id: "s",
      side: "sell",
      conditions: [{ kind: "price-change", direction: "up", pct: 10, lookback: "entry" }, { kind: "bollinger", period: 20, stdDev: 2, band: "upper" }],
      size: { unit: "pct", value: 100 },
    },
  ],
} as unknown as Strategy;

test("tunable parameters use the API's ids and its rounding", () => {
  const params = sensitivityParams(strategy);
  assert.deepEqual(params.map((p) => p.id), ["0:0:period", "0:0:value", "1:0:pct", "1:1:period", "1:1:std_dev"]);
  assert.deepEqual(params[0].values, [11, 13, 14, 15, 17]);
  assert.deepEqual(params[1].values, [28, 31.5, 35, 38.5, 42]);
  assert.deepEqual(params[4].values, [1.6, 1.8, 2, 2.2, 2.4]);
  assert.deepEqual(params[2].values, [8, 9, 10, 11, 12]);
  // "Since the entry" is not a number of candles, so there is no lookback to vary.
  assert.ok(!params.some((p) => p.field === "lookback"));
});

test("values stay inside what the parameter accepts", () => {
  const edge = { rules: [{ id: "b", side: "buy", conditions: [{ kind: "rsi", period: 2, op: "below", value: 98 }], size: { unit: "pct", value: 100 } }] } as unknown as Strategy;
  const [period, value] = sensitivityParams(edge);
  assert.ok(period.values.every((v) => v >= 2));
  assert.ok(value.values.every((v) => v <= 99));
});

test("chosen timeframes: the asked one plus the requested, in order, those that fit", () => {
  assert.deepEqual(chosenTimeframes("4h", ["1d", "15m"], "2024-01-01", "2024-06-30"), ["15m", "4h", "1d"]);
  assert.deepEqual(chosenTimeframes("4h", undefined, "2024-01-01", "2024-06-30"), ["1h", "2h", "4h", "1d", "1w"]);
  // Monthly candles give fewer than the minimum over twenty days.
  assert.deepEqual(chosenTimeframes("1d", ["1M", "4h"], "2024-01-01", "2024-01-20"), ["4h", "1d"]);
  assert.equal(timeframeFits("1m", "2024-01-01", "2024-12-31"), false);
  assert.equal(timeframeFits("1d", "2024-01-01", "2024-12-31"), true);
});

test("typed values keep the original in the middle and stay inside the accepted range", () => {
  const [period, value] = sensitivityParams(strategy);
  assert.deepEqual(valuesFromEdits(period, [10, 5, 30, 20]), [5, 10, 14, 20, 30]);
  assert.deepEqual(valuesFromEdits(value, [1, 20, 40, 5000]), [1, 20, 35, 40, 99]);
  // A value on the wrong side of the original is moved to it.
  assert.deepEqual(valuesFromEdits(period, [20, 10, 3, 15]), [10, 14, 14, 14, 15]);
  assert.equal(fitValue(period, 2.6), 3);
  assert.equal(fitValue(value, 1.234), 1.23);
});
