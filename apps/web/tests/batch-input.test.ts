import assert from "node:assert/strict";
import { test } from "node:test";

import { batchPlanProblem, BATCH_ABSOLUTE_MAX, failedItems, parseBatchBody } from "../src/lib/server/batch-input.ts";

const base = { kind: "assets", timeframe: "1d", from: "2024-01-01", to: "2024-06-30", strategy: {} };

test("units are the number of distinct assets, whatever the client says", () => {
  const parsed = parseBatchBody({ ...base, symbols: ["btc", "ETH", "BTC", "sol"], units: 1, cost: 0 });
  assert.ok(parsed);
  assert.equal(parsed.units, 3);
  assert.deepEqual(parsed.forward.symbols, ["BTC", "ETH", "SOL"]);
});

test("the same set of assets in another order hashes alike", () => {
  const a = parseBatchBody({ ...base, symbols: ["BTC", "ETH"] });
  const b = parseBatchBody({ ...base, symbols: ["eth", "btc"] });
  assert.deepEqual(a?.hashBody, b?.hashBody);
  assert.deepEqual(b?.forward.symbols, ["ETH", "BTC"]);
});

test("malformed batch bodies are refused", () => {
  assert.equal(parseBatchBody(null), null);
  assert.equal(parseBatchBody([]), null);
  assert.equal(parseBatchBody({ ...base, kind: "robustness", symbols: ["BTC"] }), null);
  assert.equal(parseBatchBody({ ...base, symbols: "BTC" }), null);
  assert.equal(parseBatchBody({ ...base, symbols: [] }), null);
  assert.equal(parseBatchBody({ ...base, symbols: ["BTC", 5] }), null);
  assert.equal(parseBatchBody({ ...base, symbols: ["BT C!"] }), null);
  const many = Array.from({ length: BATCH_ABSOLUTE_MAX + 1 }, (_, i) => `A${i}`);
  assert.equal(parseBatchBody({ ...base, symbols: many }), null);
});

test("plans cap the assets of a batch", () => {
  assert.equal(batchPlanProblem(3, 1), "not_allowed");
  assert.equal(batchPlanProblem(2, 3), null);
  assert.equal(batchPlanProblem(3, 3), null);
  assert.equal(batchPlanProblem(4, 3), "too_many");
});

test("failed items are counted from the engine response", () => {
  const text = JSON.stringify({ items: [{ symbol: "A", result: {} }, { symbol: "B", error: "no-candles" }] });
  assert.equal(failedItems(text), 1);
  assert.equal(failedItems("not json"), 0);
  assert.equal(failedItems("{}"), 0);
});

const one = { timeframe: "1d", from: "2024-01-01", to: "2024-06-30", strategy: {}, symbol: "btc" };

test("rolling windows cost one unit each, counted from the request", () => {
  const parsed = parseBatchBody({ ...one, kind: "windows", lengthDays: 60, stepDays: 30, units: 1 });
  assert.ok(parsed);
  assert.equal(parsed.kind, "windows");
  assert.equal(parsed.units, 5);
  assert.equal(parsed.forward.symbol, "BTC");
  // A window longer than the range is nothing to run.
  assert.equal(parseBatchBody({ ...one, kind: "windows", lengthDays: 400, stepDays: 30 }), null);
  assert.equal(parseBatchBody({ ...one, kind: "windows", lengthDays: 1, stepDays: 30 }), null);
  assert.equal(parseBatchBody({ ...one, kind: "windows", lengthDays: 60, stepDays: 0 }), null);
  assert.equal(parseBatchBody({ ...one, kind: "windows", lengthDays: 60.5, stepDays: 30 }), null);
});

test("sensitivity costs five simulations per varied parameter", () => {
  assert.equal(parseBatchBody({ ...one, kind: "sensitivity", params: ["0:0:value"] })?.units, 5);
  assert.equal(parseBatchBody({ ...one, kind: "sensitivity", params: ["0:0:value", "1:0:value"] })?.units, 25);
  assert.equal(parseBatchBody({ ...one, kind: "sensitivity", params: [] }), null);
  assert.equal(parseBatchBody({ ...one, kind: "sensitivity", params: ["a", "b", "c"] }), null);
  assert.equal(parseBatchBody({ ...one, kind: "sensitivity", params: ["0:0:value", "0:0:value"] }), null);
  assert.equal(parseBatchBody({ ...one, kind: "sensitivity", params: ["../etc"] }), null);
});

test("neighbouring timeframes cost one unit per timeframe that suits the range", () => {
  assert.equal(parseBatchBody({ ...one, kind: "timeframes", timeframe: "4h" })?.units, 5);
  assert.equal(parseBatchBody({ ...one, kind: "timeframes", timeframe: "4h", to: "2024-01-20" })?.units, 4);
  assert.equal(parseBatchBody({ ...one, kind: "timeframes", timeframe: "nope" }), null);
  assert.equal(parseBatchBody({ ...one, kind: "timeframes", from: "2024-07-01" }), null);
  assert.equal(parseBatchBody({ ...one, kind: "timeframes", symbol: "B T C" }), null);
});

test("a test is repeated for free: the same request hashes alike", () => {
  const a = parseBatchBody({ ...one, kind: "sensitivity", params: ["0:0:value"], symbol: "BTC" });
  const b = parseBatchBody({ ...one, kind: "sensitivity", params: ["0:0:value"], symbol: "btc" });
  assert.deepEqual(a?.hashBody, b?.hashBody);
});

test("sensitivity reports its variants as cells, and those that did not run are given back", () => {
  assert.equal(failedItems(JSON.stringify({ cells: [{ error: "conflict" }, { error: null }, { error: "invalid" }] })), 2);
});

test("chosen timeframes cost one unit each and hash the same in any order", () => {
  const long = { ...one, kind: "timeframes", timeframe: "4h" };
  const a = parseBatchBody({ ...long, timeframes: ["1d", "15m"] });
  const b = parseBatchBody({ ...long, timeframes: ["15m", "1d"] });
  assert.ok(a && b);
  assert.equal(a.units, 3); // 15m, 4h and 1d: the one asked for always takes part
  assert.deepEqual(a.forward.timeframes, ["15m", "1d"]);
  assert.deepEqual(a.hashBody, b.hashBody);
  // Without the list the neighbours run, as before.
  assert.equal(parseBatchBody(long)?.units, 5);
  assert.equal(parseBatchBody({ ...long, timeframes: [] }), null);
  assert.equal(parseBatchBody({ ...long, timeframes: ["1d", "1d"] }), null);
  assert.equal(parseBatchBody({ ...long, timeframes: ["2d"] }), null);
  assert.equal(parseBatchBody({ ...long, timeframes: "1d" }), null);
  assert.equal(parseBatchBody({ ...long, timeframes: ["1m", "3m", "5m", "15m", "30m", "1h"] }), null);
});
