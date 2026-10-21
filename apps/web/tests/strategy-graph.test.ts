import assert from "node:assert/strict";
import { test } from "node:test";

import type { Condition, Rule } from "../src/lib/strategy.ts";
import {
  addNode,
  autoWire,
  canConnect,
  columnsFor,
  connect,
  defaultRow,
  emptyGraph,
  graphToRules,
  levelsOf,
  moveNode,
  PRICE_ID,
  removeNode,
  rulesToGraph,
} from "../src/lib/strategy-graph.ts";

const rsi = (value: number): Condition => ({ kind: "rsi", period: 14, op: "below", value });
const rule = (id: string, side: "buy" | "sell", ...conditions: Condition[]): Rule => ({
  id,
  side,
  conditions,
  size: { unit: "pct", value: 100 },
});

test("rules survive a round trip through the graph", () => {
  const rules = [rule("a", "buy", rsi(1), rsi(2), rsi(3)), rule("b", "sell", rsi(4))];
  const { rules: back, incomplete } = graphToRules(rulesToGraph(rules));
  assert.deepEqual(back, rules);
  assert.deepEqual(incomplete, []);
});

test("an empty strategy is just the price node", () => {
  const graph = rulesToGraph([]);
  assert.deepEqual(graph, emptyGraph());
  assert.deepEqual(graphToRules(graph).rules, []);
});

test("nodes added by hand are incomplete until chained to the price", () => {
  let graph = emptyGraph();
  const cond = addNode(graph, { type: "condition", condition: rsi(30) }, 1, 0, 10);
  const amount = addNode(cond.graph, { type: "amount", size: { unit: "pct", value: 50 } }, 6, 0, 10);
  const action = addNode(amount.graph, { type: "action", side: "buy" }, 7, 0, 10);
  graph = action.graph;
  assert.equal(graphToRules(graph).incomplete.length, 3);
  graph = connect(graph, PRICE_ID, cond.id!, 3);
  graph = connect(graph, cond.id!, amount.id!, 3);
  assert.equal(graphToRules(graph).rules.length, 0);
  graph = connect(graph, amount.id!, action.id!, 3);
  const { rules, incomplete } = graphToRules(graph);
  assert.deepEqual(incomplete, []);
  assert.deepEqual(rules, [{ id: action.id, side: "buy", conditions: [rsi(30)], size: { unit: "pct", value: 50 } }]);
});

test("wires follow the chain grammar and the condition limit", () => {
  const graph = rulesToGraph([rule("a", "buy", rsi(1), rsi(2), rsi(3)), rule("b", "buy", rsi(4))]);
  // price cannot feed an amount; an amount cannot feed a condition
  assert.equal(canConnect(graph, PRICE_ID, "a:amount", 3), false);
  assert.equal(canConnect(graph, "b:amount", "a:c0", 3), false);
  // the 3-condition chain can still end in another amount (3 conditions in total)
  assert.equal(canConnect(graph, "a:c2", "b:amount", 3), true);
  const added = addNode(graph, { type: "and" }, 2, 5, 10);
  assert.equal(canConnect(added.graph, "b:c0", added.id!, 3), true);
  assert.equal(connect(added.graph, "b:c0", added.id!, 3).edges.some((e) => e.to === added.id), true);
});

test("a chain can't grow past the limit", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1), rsi(2))]);
  const and = addNode(graph, { type: "and" }, 4, 6, 10);
  const extra = addNode(and.graph, { type: "condition", condition: rsi(9) }, 5, 6, 10);
  graph = extra.graph;
  graph = connect(graph, "a:c1", and.id!, 3);
  graph = connect(graph, and.id!, extra.id!, 2);
  assert.equal(graph.edges.some((e) => e.to === extra.id), false);
  assert.equal(graphToRules(graph).rules.length, 1);
  const again = addNode(graph, { type: "condition", condition: rsi(10) }, 3, 7, 10);
  assert.equal(canConnect(again.graph, PRICE_ID, again.id!, 3), true);
});

test("conditions and amounts give one wire out; an amount takes several in", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "buy", rsi(2))]);
  graph = connect(graph, "a:c0", "b:amount", 3);
  assert.equal(graph.edges.filter((e) => e.to === "b:amount").length, 2);
  assert.equal(graph.edges.filter((e) => e.from === "a:c0").length, 1);
  // two conditions feeding one amount are two rules sharing it
  const { rules, incomplete } = graphToRules(graph);
  assert.equal(rules.length, 2);
  assert.equal(new Set(rules.map((r) => r.id)).size, 2);
  // the first rule lost its amount's wire out, so its leftovers are incomplete
  assert.deepEqual([...incomplete].sort(), ["a", "a:amount"]);
});

test("an AND takes several conditions in and gives several out, whatever their rows", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "buy", rsi(2))]);
  const and = addNode(graph, { type: "and" }, 2, 9, 10);
  const x = addNode(and.graph, { type: "condition", condition: rsi(3) }, 3, 0, 10);
  const y = addNode(x.graph, { type: "condition", condition: rsi(4) }, 3, 7, 10);
  graph = y.graph;
  graph = connect(graph, "a:c0", and.id!, 3);
  graph = connect(graph, "b:c0", and.id!, 3);
  graph = connect(graph, and.id!, x.id!, 3);
  graph = connect(graph, and.id!, y.id!, 3);
  assert.equal(graph.edges.filter((e) => e.to === and.id).length, 2);
  assert.equal(graph.edges.filter((e) => e.from === and.id).length, 2);
  graph = connect(connect(graph, x.id!, "a:amount", 3), y.id!, "b:amount", 3);
  // 2 conditions in, 2 out: both inputs are required, so two rules (A+B+x, A+B+y), not four
  const { rules } = graphToRules(graph);
  const three = rules.filter((r) => r.conditions.length === 3);
  assert.equal(three.length, 2);
  assert.deepEqual(three.map((r) => r.conditions.map((c) => (c.kind === "rsi" ? c.value : null))).map((c) => c.slice(0, 2)), [[1, 2], [1, 2]]);
});

test("an AND only joins conditions of the same depth", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1), rsi(2)), rule("b", "buy", rsi(3))]);
  assert.equal(canConnect(graph, "b:c0", "a:and1", 3), true);
  graph = connect(graph, "b:c0", "a:and1", 3);
  const deeper = addNode(graph, { type: "and" }, 4, 8, 10);
  assert.equal(canConnect(deeper.graph, "a:c1", deeper.id!, 3), true);
  const joined = connect(deeper.graph, "a:c1", deeper.id!, 3);
  assert.equal(canConnect(joined, "b:c0", deeper.id!, 3), false);
});

test("a fixed amount that feeds a sell becomes a percentage", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  const amount = addNode(graph, { type: "amount", size: { unit: "usdt", value: 50 } }, 6, 5, 10);
  const sell = addNode(amount.graph, { type: "action", side: "sell" }, 7, 5, 10);
  graph = connect(sell.graph, amount.id!, sell.id!, 3);
  const node = graph.nodes.find((n) => n.id === amount.id);
  assert.equal(node?.type === "amount" && node.size.unit, "pct");
});

test("nodes only move inside their own columns, without sharing a cell", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "buy", rsi(2))]);
  assert.equal(moveNode(graph, "a:amount", 5, 0), graph);
  graph = moveNode(graph, "a:amount", 6, 1);
  const rows = graph.nodes.filter((n) => n.col === 6).map((n) => n.row);
  assert.equal(new Set(rows).size, 2);
  // a condition can't jump past the node it feeds
  assert.equal(moveNode(graph, "a:c0", 7, 0), graph);
});

test("removing a node drops its wires; the price node stays", () => {
  const graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  const without = removeNode(graph, "a:c0");
  assert.equal(without.edges.some((e) => e.from === "a:c0" || e.to === "a:c0"), false);
  assert.deepEqual(graphToRules(without).rules, []);
  assert.equal(removeNode(graph, PRICE_ID), graph);
});

test("the number of action nodes is limited", () => {
  const graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  assert.equal(addNode(graph, { type: "action", side: "sell" }, 7, 3, 1).id, null);
});

test("wiring re-lays the chain: columns follow the position in the chain", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  assert.equal(levelsOf(graph), 1);
  const and = addNode(graph, { type: "and" }, 2, 4, 10);
  graph = and.graph;
  // an AND already reserves the column of the next condition
  assert.equal(levelsOf(graph), 2);
  const extra = addNode(graph, { type: "condition", condition: rsi(2) }, 1, 4, 10);
  graph = connect(extra.graph, "a:c0", and.id!, 3);
  graph = connect(graph, and.id!, extra.id!, 3);
  graph = connect(graph, extra.id!, "a:amount", 3);
  const node = (id: string) => graph.nodes.find((n) => n.id === id)!;
  assert.equal(node(extra.id!).col, 3);
  assert.equal(levelsOf(graph), 2);
  // the first condition still feeds the amount too: one rule alone, one with the extra condition
  assert.deepEqual(graphToRules(graph).rules.map((r) => r.conditions.length).sort(), [1, 2]);
  // deleting the AND and the extra condition collapses the panel back to one condition
  graph = removeNode(removeNode(graph, and.id!), extra.id!);
  assert.equal(levelsOf(graph), 1);
});

test("connections are kept when nodes are re-laid out; loops are refused", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1), rsi(2))]);
  const before = graph.edges.length;
  graph = moveNode(graph, "a:c1", 3, 5);
  assert.equal(graph.edges.length, before);
  assert.deepEqual(graphToRules(graph).rules.length, 1);
  assert.equal(canConnect(graph, "a:and1", "a:c0", 3), false);
});

test("visible columns grow with the levels", () => {
  assert.deepEqual(columnsFor("condition", 1), [1]);
  assert.deepEqual(columnsFor("condition", 2), [1, 3]);
  assert.deepEqual(columnsFor("and", 1), []);
  assert.deepEqual(columnsFor("and", 3), [2, 4]);
  assert.deepEqual(columnsFor("action", 1), [7]);
});

test("nodes added without a row take rows 2, 3, 1, 4 of their column", () => {
  let graph = emptyGraph();
  const rows: number[] = [];
  for (let i = 0; i < 5; i++) {
    const row = defaultRow(graph, 1);
    rows.push(row);
    graph = addNode(graph, { type: "condition", condition: rsi(i + 1) }, 1, row, 10).graph;
  }
  assert.deepEqual(rows.slice(0, 4), [1, 2, 0, 3]);
  assert.equal(new Set(graph.nodes.filter((n) => n.col === 1).map((n) => n.row)).size, 5);
});

test("only first-column conditions are wired on their own, to the price", () => {
  let graph = emptyGraph();
  const cond = addNode(graph, { type: "condition", condition: rsi(30) }, 1, 1, 10);
  graph = autoWire(cond.graph, cond.id!, 3);
  assert.equal(graph.edges.length, 1);
  const amount = addNode(graph, { type: "amount", size: { unit: "pct", value: 100 } }, 6, 1, 10);
  const same = autoWire(amount.graph, amount.id!, 3);
  assert.equal(same.edges.length, 1);
  // a node of another column in the same row stays loose
  const action = addNode(same, { type: "action", side: "buy" }, 7, 1, 10);
  assert.equal(autoWire(action.graph, action.id!, 3).edges.length, 1);
});

test("auto-wiring never replaces a wire that exists", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  const before = graph.edges.length;
  const added = addNode(graph, { type: "condition", condition: rsi(2) }, 1, 1, 10);
  graph = autoWire(added.graph, added.id!, 3);
  assert.equal(graph.edges.length, before + 1);
  assert.equal(graph.edges.filter((e) => e.to === "a:amount").length, 1);
  assert.equal(autoWire(graph, "a:c0", 3), graph);
});

test("a condition can feed several ANDs, and one amount", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "buy", rsi(2))]);
  const and1 = addNode(graph, { type: "and" }, 2, 8, 10);
  const and2 = addNode(and1.graph, { type: "and" }, 2, 12, 10);
  graph = and2.graph;
  graph = connect(graph, "a:c0", and1.id!, 3);
  graph = connect(graph, "a:c0", and2.id!, 3);
  assert.equal(graph.edges.filter((e) => e.from === "a:c0" && (e.to === and1.id || e.to === and2.id)).length, 2);
  assert.equal(graph.edges.some((e) => e.from === "a:c0" && e.to === "a:amount"), true);
  // a second amount replaces the first one only
  graph = connect(graph, "a:c0", "b:amount", 3);
  assert.equal(graph.edges.some((e) => e.from === "a:c0" && e.to === "a:amount"), false);
  assert.equal(graph.edges.filter((e) => e.from === "a:c0").length, 3);
});

test("a condition can be moved to a deeper condition column and wired again there", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "buy", rsi(2))]);
  const and = addNode(graph, { type: "and" }, 2, 5, 10);
  graph = connect(and.graph, "a:c0", and.id!, 3);
  graph = moveNode(graph, "b:c0", 3, 5);
  const moved = graph.nodes.find((n) => n.id === "b:c0")!;
  assert.equal(moved.col, 3);
  assert.equal(graph.edges.some((e) => e.to === "b:c0"), false);
  graph = connect(graph, and.id!, "b:c0", 3);
  assert.equal(graph.nodes.find((n) => n.id === "b:c0")!.col, 3);
  assert.deepEqual(graphToRules(graph).rules.map((r) => r.conditions.length).sort(), [1, 2]);
});
