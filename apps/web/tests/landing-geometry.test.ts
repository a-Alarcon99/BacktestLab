import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arcPoint,
  bandPath,
  candleShapes,
  cubicPoint,
  extent,
  histogram,
  linePath,
  linear,
  maxDrawdownPct,
  niceTicks,
  phase,
  runningFigures,
  slotX,
  wireControls,
} from "../src/lib/landing/geometry.ts";
import data from "../src/lib/landing/snapshot.json" with { type: "json" };
import type { Snapshot } from "../src/lib/landing/snapshot.ts";

const snapshot = data as unknown as Snapshot;

test("linear maps the domain onto the range and centres a flat domain", () => {
  const y = linear(100, 200, 300, 0);
  assert.equal(y(100), 300);
  assert.equal(y(200), 0);
  assert.equal(y(150), 150);
  assert.equal(linear(5, 5, 0, 10)(5), 5);
});

test("extent ignores non-finite values", () => {
  assert.deepEqual(extent([3, Number.NaN, -1, 8]), [-1, 8]);
  assert.deepEqual(extent([]), [0, 1]);
});

test("paths are rounded to one decimal and bands close", () => {
  assert.equal(linePath([{ x: 0, y: 1.234 }, { x: 2.26, y: 3 }]), "M0 1.2L2.3 3");
  const band = bandPath([{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 0, y: 5 }, { x: 1, y: 5 }]);
  assert.equal(band, "M0 0L1 0L1 5L0 5Z");
});

test("slots are centred and candles keep a visible body", () => {
  assert.equal(slotX(0, 4, 0, 100), 12.5);
  const [flat, up] = candleShapes(
    [
      [10, 12, 8, 10],
      [10, 14, 9, 13],
    ],
    0,
    20,
    linear(0, 20, 20, 0)
  );
  assert.equal(flat.bodyH, 1);
  assert.equal(up.up, true);
  assert.equal(up.bodyY, 7);
  assert.equal(up.wickTop, 6);
});

test("drawdown is the worst fall from a running peak", () => {
  assert.equal(maxDrawdownPct([100, 120, 90, 130]), 25);
  assert.equal(maxDrawdownPct([100, 120, 90, 130], 1), 0);
  assert.equal(maxDrawdownPct([90], 0, 100), 10);
});

test("axis ticks are round and inside the range", () => {
  assert.deepEqual(niceTicks(98_300, 111_900, 4), [100_000, 105_000, 110_000]);
  assert.deepEqual(niceTicks(0, 1, 4), [0, 0.25, 0.5, 0.75, 1]);
});

test("histogram bins by inner edges", () => {
  assert.deepEqual(histogram([-5, -1, 0, 3, 10], [-2, 0, 5]), [1, 1, 2, 1]);
});

test("the replay's running figures end on the snapshot stats", () => {
  const { trades, equity, stats } = snapshot.replay;
  const figures = runningFigures(trades, equity, snapshot.initialCapital);
  const last = figures.at(-1)!;
  assert.equal(last.trades, stats.roundTrips);
  assert.ok(Math.abs(last.returnPct - stats.returnPct) < 0.01);
  assert.ok(Math.abs(last.winRatePct - stats.winRatePct) < 0.1);
  assert.ok(Math.abs(maxDrawdownPct(equity, equity.length - 1, snapshot.initialCapital) - stats.maxDrawdownPct) < 0.01);
});

test("snapshot blocks are consistent", () => {
  const { replay, builder, metrics } = snapshot;
  assert.equal(replay.candles.length, replay.lower.length);
  assert.equal(replay.candles.length, replay.equity.length);
  for (const t of replay.trades) assert.ok(t.entry < t.exit && t.exit < replay.candles.length);
  assert.ok(builder.and.every((i) => builder.or.includes(i)));
  assert.ok(builder.andCount <= builder.orCount);
  assert.equal(metrics.closes.length, metrics.equity.length);
  assert.equal(metrics.trades.length, metrics.stats.roundTrips);
  for (const t of metrics.trades) assert.ok(t.entry <= t.exit && t.exit < metrics.closes.length);
});

test("curves start and end on their endpoints", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 50 };
  const [p0, p1, p2, p3] = wireControls(a, b, "h");
  assert.deepEqual(cubicPoint(p0, p1, p2, p3, 0), a);
  assert.deepEqual(cubicPoint(p0, p1, p2, p3, 1), b);
  assert.deepEqual(arcPoint(a, b, 40, 1), b);
  assert.ok(arcPoint(a, b, 40, 0.5).y < 0);
  assert.equal(phase(5, 4, 2), 0.5);
  assert.equal(phase(10, 4, 2), 1);
});
