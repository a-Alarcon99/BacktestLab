import assert from "node:assert/strict";
import { test } from "node:test";

import {
  benchmarkTone,
  consistencyTone,
  liveFigures,
  liveTrack,
  previousRun,
  reliabilityWarnings,
  resultBins,
  riskTone,
  splitDuration,
  tradesCsv,
  verdict,
} from "../src/lib/backtest-report.ts";
import type { BacktestRecord, BacktestResult, RoundTrip } from "../src/lib/backtests.ts";
// A real engine result (apps/api: 400 1h candles of a random walk, RSI 40/60 with partial sells,
// fee 0.1 %), so these tests also check the web and the engine agree.
import data from "./fixtures/backtest-result.json" with { type: "json" };

const result = data as unknown as BacktestResult;
const capital = 1000;

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("live figures on the last candle are the engine's final figures", () => {
  const track = liveTrack(result);
  const last = liveFigures(result, track, capital, result.candles.length - 1);
  close(last.equity, result.stats.finalCapital);
  close(last.returnPct, result.stats.returnPct);
  close(last.benchmarkReturnPct, result.metrics.benchmarkReturnPct);
  close(last.maxDrawdownPct, result.metrics.maxDrawdownPct);
  assert.equal(last.closed, result.metrics.roundTrips);
  assert.equal(last.wins, result.metrics.wins);
  assert.equal(last.orders, result.stats.trades);
  assert.equal(last.openTrip !== null, result.stats.openPosition);
});

test("live figures only count what already happened", () => {
  const track = liveTrack(result);
  const first = liveFigures(result, track, capital, 0);
  assert.equal(first.closed, 0);
  assert.ok(first.maxDrawdownPct <= result.metrics.maxDrawdownPct);
  for (let i = 1; i < result.candles.length; i++) {
    assert.ok(track.closed[i] >= track.closed[i - 1]);
    assert.ok(track.maxDrawdown[i] >= track.maxDrawdown[i - 1]);
  }
});

test("engine and report agree on the trades", () => {
  const sum = result.roundTrips.reduce((s, t) => s + t.pnl, 0);
  close(sum, result.stats.finalCapital - capital, 1e-6);
  assert.equal(result.roundTrips.filter((t) => !t.open).length, result.metrics.roundTrips);
  assert.ok(result.trades.every((t) => result.roundTrips[t.roundTrip] !== undefined));
  assert.equal(result.drawdown.length, result.candles.length);
  close(Math.max(...result.drawdown), result.stats.maxDrawdownPct);
});

test("tones at their limits", () => {
  assert.equal(benchmarkTone(1.01), "good");
  assert.equal(benchmarkTone(1), "mixed");
  assert.equal(benchmarkTone(-1), "mixed");
  assert.equal(benchmarkTone(-1.01), "bad");
  assert.equal(riskTone(10, 5), "good");
  assert.equal(riskTone(20, 45), "good"); // under half of buy and hold's fall
  assert.equal(riskTone(20, 30), "mixed");
  assert.equal(riskTone(30, 60), "mixed"); // big, but far smaller than the market's
  assert.equal(riskTone(30, 35), "bad");
  assert.equal(riskTone(41, 80), "bad");
  assert.equal(consistencyTone(null, 3, 3), "good");
  assert.equal(consistencyTone(1.5, 3, 5), "good");
  assert.equal(consistencyTone(1.2, 3, 5), "mixed");
  assert.equal(consistencyTone(0.8, 3, 5), "bad");
  assert.equal(consistencyTone(null, 0, 0), "mixed");
});

const withMetrics = (patch: Partial<BacktestResult["metrics"]>, stats: Partial<BacktestResult["stats"]> = {}) =>
  ({ ...result, metrics: { ...result.metrics, ...patch }, stats: { ...result.stats, ...stats } }) as BacktestResult;

test("verdict headline", () => {
  // The fixture lost money, but less than the market (which fell more).
  assert.equal(verdict(result).headline, "loses-less");
  assert.equal(verdict(withMetrics({ returnPct: 12, excessReturnPct: 5, maxDrawdownPct: 8 })).headline, "beats");
  assert.equal(verdict(withMetrics({ returnPct: 12, excessReturnPct: 5, maxDrawdownPct: 45 })).headline, "beats-risky");
  assert.equal(verdict(withMetrics({ returnPct: 12, excessReturnPct: -6 })).headline, "lags");
  assert.equal(verdict(withMetrics({ returnPct: 12, excessReturnPct: 0.4 })).headline, "matches");
  assert.equal(verdict(withMetrics({ returnPct: -3, excessReturnPct: -3 })).headline, "loses");
  assert.equal(verdict(withMetrics({}, { trades: 0 })).headline, "no-trades");
  assert.deepEqual(
    verdict(result).items.map((i) => i.id),
    ["result", "benchmark", "risk", "consistency"]
  );
});

test("reliability warnings", () => {
  const ids = reliabilityWarnings(result).map((w) => w.id);
  // 9 closed trades, one still open, 400 hours (< 30 days).
  assert.deepEqual(ids, ["few-trades", "open-position", "short-period"]);
  assert.deepEqual(
    reliabilityWarnings(withMetrics({}, { trades: 0 })).map((w) => w.id).slice(0, 1),
    ["no-trades"]
  );
  const lucky = withMetrics({ roundTrips: 40, bestTradeSharePct: 70, days: 400, benchmarkReturnPct: 2 });
  assert.deepEqual(
    reliabilityWarnings(lucky).map((w) => w.id),
    ["open-position", "one-trade", "sideways"]
  );
});

const strategy = { id: "s1", name: "S", initialCapital: 1000, feePct: 0.1, rules: [] } as unknown as BacktestRecord["strategy"];
const record = (id: string, patch: Partial<BacktestRecord> = {}): BacktestRecord =>
  ({
    schemaVersion: 2,
    id,
    executedAt: "2026-01-01T00:00:00Z",
    symbol: "BTC",
    timeframe: "1d",
    from: "2025-01-01",
    to: "2025-12-31",
    strategy,
    equity: [],
    stats: { returnPct: 10, maxDrawdownPct: 5, sharpe: 1, winRatePct: 50, trades: 4, finalCapital: 1100, benchmarkReturnPct: 5, profitFactor: 2, roundTrips: 2, exposurePct: 40 },
    ...patch,
  }) as BacktestRecord;

test("previous run: same strategy and asset, older than the current one, never version 1", () => {
  const request = { symbol: "BTC", timeframe: "1d" as const, from: "2025-01-01", to: "2025-12-31", strategy };
  const current = { returnPct: 15, maxDrawdownPct: 4, winRatePct: 60 };
  const records = [
    record("now"),
    record("other-asset", { symbol: "ETH" }),
    { ...record("old-engine"), schemaVersion: 1 } as BacktestRecord,
    record("before", { from: "2024-01-01" }),
    record("oldest"),
  ];
  const prev = previousRun(records, request, current, "now");
  assert.equal(prev?.record.id, "before");
  close(prev!.returnDelta, 5);
  assert.equal(prev!.samePeriod, false);
  assert.equal(prev!.sameRules, true);
  // Reviewing "before": the previous one is older than it.
  assert.equal(previousRun(records, request, current, "before")?.record.id, "oldest");
  assert.equal(previousRun(records.slice(0, 3), request, current, "now"), null);
});

test("result bins put 0 on an edge and count every trade", () => {
  const values = [-3.2, -0.4, 0.1, 0.8, 2.5, 7.9];
  const { edges, counts } = resultBins(values);
  assert.ok(edges.includes(0));
  assert.equal(counts.reduce((a, b) => a + b, 0), values.length);
  assert.ok(edges[0] <= -3.2 && edges[edges.length - 1] > 7.9);
  assert.deepEqual(resultBins([]), { edges: [], counts: [] });
  const one = resultBins([5]);
  assert.equal(one.counts.reduce((a, b) => a + b, 0), 1);
});

test("durations", () => {
  assert.deepEqual(splitDuration(3 * 86400 + 4 * 3600 + 59), { days: 3, hours: 4, minutes: 1 });
  assert.deepEqual(splitDuration(0), { days: 0, hours: 0, minutes: 0 });
});

test("trades CSV in both languages", () => {
  const trip: RoundTrip = {
    entryIndex: 0,
    exitIndex: 3,
    entryTime: "2026-01-01T08:00:00Z",
    exitTime: "2026-01-02T12:00:00Z",
    entryPrice: 64210.5,
    exitPrice: 66000,
    invested: 1000,
    pnl: 25.37,
    pnlPct: 2.537,
    bars: 7,
    durationSeconds: 28 * 3600,
    exitRuleId: "r1",
    open: false,
    worstPct: -1.2,
    buys: 1,
    sells: 1,
  };
  const headers = ["#", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
  const es = tradesCsv([trip], "es", headers, () => "Venta; regla 1", () => "Cerrada");
  assert.ok(es.startsWith("﻿#;a;"));
  assert.ok(es.includes('1;2026-01-01 08:00;2026-01-02 12:00;64210,5;66000;1000,00;25,37;2,54;7;28,00;"Venta; regla 1";Cerrada'));
  const en = tradesCsv([trip], "en", headers, () => "Sell rule 1", () => "Closed");
  assert.ok(en.includes("1,2026-01-01 08:00,2026-01-02 12:00,64210.5,66000,1000.00,25.37,2.54,7,28.00,Sell rule 1,Closed"));
});
