import assert from "node:assert/strict";
import { test } from "node:test";

import type { Condition, Rule } from "../src/lib/strategy.ts";
import {
  addNode,
  autoWire,
  canConnect,
  COLUMN_COUNT,
  connect,
  defaultRow,
  emptyGraph,
  graphToRules,
  moveNode,
  PRICE_ID,
  removeNode,
  rulesToGraph,
  setMode,
  shownColumns,
  sideOf,
  updateNode,
  usedColumns,
  type Graph,
} from "../src/lib/strategy-graph.ts";

const rsi = (value: number): Condition => ({ kind: "rsi", period: 14, op: "below", value });
const full = { unit: "pct", value: 100 } as const;
const rule = (id: string, side: "buy" | "sell", ...conditions: Condition[]): Rule => ({
  id,
  side,
  conditions,
  size: full,
});
const cond = (graph: Graph, value: number, col: number, row: number) =>
  addNode(graph, { type: "condition", condition: rsi(value) }, col, row, 10);
const action = (graph: Graph, side: "buy" | "sell", col: number, row: number) =>
  addNode(graph, { type: "action", side, size: full }, col, row, 10);

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

test("rules can start on the first row (read-only view)", () => {
  const graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "sell", rsi(2))], 0);
  assert.deepEqual([...new Set(graph.nodes.filter((n) => n.type !== "price").map((n) => n.row))].sort(), [0, 1]);
});

test("nodes added by hand are incomplete until wired from the price to an action", () => {
  let graph = emptyGraph();
  const c = cond(graph, 30, 1, 0);
  const a = addNode(c.graph, { type: "action", side: "buy", size: { unit: "pct", value: 50 } }, 2, 0, 10);
  graph = a.graph;
  assert.equal(graphToRules(graph).incomplete.length, 2);
  graph = connect(graph, PRICE_ID, c.id!, 3);
  assert.equal(graphToRules(graph).rules.length, 0);
  graph = connect(graph, c.id!, a.id!, 3);
  const { rules, incomplete } = graphToRules(graph);
  assert.deepEqual(incomplete, []);
  assert.deepEqual(rules, [{ id: a.id, side: "buy", conditions: [rsi(30)], size: { unit: "pct", value: 50 } }]);
});

test("a condition not wired back to the price makes no rule", () => {
  let graph = emptyGraph();
  const c = cond(graph, 30, 1, 0);
  const d = cond(c.graph, 40, 2, 0);
  const a = action(d.graph, "buy", 3, 0);
  graph = connect(connect(a.graph, c.id!, d.id!, 3), d.id!, a.id!, 3);
  assert.equal(graphToRules(graph).rules.length, 0);
  assert.equal(graphToRules(graph).incomplete.length, 3);
});

test("wires go from the price to conditions, between conditions and to actions, always to the right", () => {
  const graph = rulesToGraph([rule("a", "buy", rsi(1), rsi(2)), rule("b", "buy", rsi(4))]);
  // price cannot feed an action; an action cannot give anything
  assert.equal(canConnect(graph, PRICE_ID, "a", 3), false);
  assert.equal(canConnect(graph, "a", "b:c0", 3), false);
  // a condition can feed a condition of another rule further right, but never one in its column or to its left
  assert.equal(canConnect(graph, "b:c0", "a:c1", 3), true);
  assert.equal(canConnect(graph, "a:c0", "b:c0", 3), false);
  assert.equal(canConnect(graph, "a:c1", "b:c0", 3), false);
  assert.equal(canConnect(graph, "b:c0", "a", 3), true);
  // wires are never repeated
  assert.equal(canConnect(graph, "a:c0", "a:c1", 3), false);
});

test("every condition wired into a node must hold: A and B into C make one rule A+B+C", () => {
  let graph = emptyGraph();
  const a = cond(graph, 1, 1, 0);
  const b = cond(a.graph, 2, 1, 1);
  const c = cond(b.graph, 3, 2, 0);
  const buy = action(c.graph, "buy", 3, 0);
  graph = buy.graph;
  for (const [from, to] of [[PRICE_ID, a.id], [PRICE_ID, b.id], [a.id, c.id], [b.id, c.id], [c.id, buy.id]] as const) {
    graph = connect(graph, from!, to!, 3);
  }
  const { rules, incomplete } = graphToRules(graph);
  assert.deepEqual(rules.map((r) => r.conditions), [[rsi(1), rsi(2), rsi(3)]]);
  assert.deepEqual(incomplete, []);
});

test("several conditions wired straight into an action are all required too", () => {
  let graph = emptyGraph();
  const a = cond(graph, 1, 1, 0);
  const b = cond(a.graph, 2, 1, 1);
  const sell = action(b.graph, "sell", 2, 0);
  graph = sell.graph;
  for (const [from, to] of [[PRICE_ID, a.id], [PRICE_ID, b.id], [a.id, sell.id], [b.id, sell.id]] as const) {
    graph = connect(graph, from!, to!, 3);
  }
  const { rules } = graphToRules(graph);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].conditions, [rsi(1), rsi(2)]);
  assert.equal(rules[0].side, "sell");
});

test("a condition can feed several conditions and actions; each action is a rule", () => {
  let graph = emptyGraph();
  const a = cond(graph, 1, 1, 0);
  const b = cond(a.graph, 2, 2, 0);
  const buy = action(b.graph, "buy", 3, 0);
  const sell = action(buy.graph, "sell", 3, 1);
  graph = sell.graph;
  for (const [from, to] of [[PRICE_ID, a.id], [a.id, b.id], [a.id, buy.id], [b.id, sell.id]] as const) {
    graph = connect(graph, from!, to!, 3);
  }
  const { rules, incomplete } = graphToRules(graph);
  assert.deepEqual(rules.map((r) => [r.side, r.conditions.length]), [["buy", 1], ["sell", 2]]);
  assert.deepEqual(incomplete, []);
  assert.equal(graph.edges.filter((e) => e.from === a.id).length, 2);
});

test("a rule can't hold more conditions than the limit", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1), rsi(2), rsi(3))]);
  const extra = cond(graph, 4, 4, 5);
  graph = moveNode(connect(extra.graph, PRICE_ID, extra.id!, 3), "a", 5, 1);
  // a 4th condition feeding the action would make a rule of 4; it can't feed the 3rd's chain either
  assert.equal(canConnect(graph, extra.id!, "a", 3), false);
  assert.equal(canConnect(graph, extra.id!, "a", 4), true);
  assert.equal(canConnect(graph, "a:c2", extra.id!, 3), false);
});

test("nodes sit in any column but the price's, without sharing a cell", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "buy", rsi(2))]);
  assert.equal(moveNode(graph, "a:c0", 0, 0), graph);
  assert.equal(moveNode(graph, PRICE_ID, 1, 0), graph);
  graph = moveNode(graph, "a", 1, 2);
  const rows = graph.nodes.filter((n) => n.col === 1).map((n) => n.row);
  assert.equal(new Set(rows).size, rows.length);
  assert.equal(addNode(graph, { type: "action", side: "buy", size: full }, 0, 0, 10).id, null);
  assert.equal(addNode(graph, { type: "condition", condition: rsi(9) }, COLUMN_COUNT, 0, 10).id, null);
});

test("a condition moved to another column keeps the wires that still go to the right", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1)), rule("b", "buy", rsi(2))]);
  // 2nd column -> 4th: the price wire stays, and it can feed the same action
  graph = moveNode(graph, "b:c0", 3, 1);
  assert.equal(graph.nodes.find((n) => n.id === "b:c0")!.col, 3);
  assert.equal(graph.edges.some((e) => e.from === PRICE_ID && e.to === "b:c0"), true);
  // its action sat in column 2: that wire would now go back, so it is dropped
  assert.equal(graph.edges.some((e) => e.from === "b:c0" && e.to === "b"), false);
  graph = moveNode(graph, "b", 4, 1);
  graph = connect(graph, "b:c0", "b", 3);
  assert.deepEqual(graphToRules(graph).rules.map((r) => r.id), ["a", "b"]);
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
  assert.equal(addNode(graph, { type: "action", side: "sell", size: full }, 3, 3, 1).id, null);
});

test("the amount lives in the action and can be edited", () => {
  let graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  graph = updateNode(graph, "a", { type: "action", size: { unit: "usdt", value: 250 } });
  assert.deepEqual(graphToRules(graph).rules[0].size, { unit: "usdt", value: 250 });
  assert.equal(sideOf(graph, "a:c0"), "buy");
  assert.equal(sideOf(emptyGraph(), PRICE_ID), undefined);
});

test("the panel shows the used columns plus a free one", () => {
  const empty = emptyGraph();
  assert.equal(usedColumns(empty), 1);
  assert.equal(shownColumns(empty), 3);
  const chain = rulesToGraph([rule("a", "buy", rsi(1), rsi(2))]);
  assert.equal(usedColumns(chain), 4);
  assert.equal(shownColumns(chain), 5);
  assert.equal(shownColumns(rulesToGraph([rule("a", "buy", rsi(1), rsi(2), rsi(3))])), COLUMN_COUNT);
});

test("nodes added without a row take rows 2, 3, 1, 4 of their column", () => {
  let graph = emptyGraph();
  const rows: number[] = [];
  for (let i = 0; i < 5; i++) {
    const row = defaultRow(graph, 1);
    rows.push(row);
    graph = cond(graph, i + 1, 1, row).graph;
  }
  assert.deepEqual(rows.slice(0, 4), [1, 2, 0, 3]);
  assert.equal(new Set(graph.nodes.filter((n) => n.col === 1).map((n) => n.row)).size, 5);
});

test("only first-column conditions are wired on their own, to the price", () => {
  const first = cond(emptyGraph(), 30, 1, 1);
  const wired = autoWire(first.graph, first.id!, 3);
  assert.equal(wired.edges.length, 1);
  const later = cond(wired, 40, 2, 1);
  assert.equal(autoWire(later.graph, later.id!, 3).edges.length, 1);
  const buy = action(wired, "buy", 2, 1);
  assert.equal(autoWire(buy.graph, buy.id!, 3).edges.length, 1);
});

test("auto-wiring never repeats a wire that exists", () => {
  const graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  assert.equal(autoWire(graph, "a:c0", 3), graph);
});

const wire = (graph: Graph, pairs: (readonly [string, string | null])[]) =>
  pairs.reduce((g, [from, to]) => connect(g, from, to!, 3), graph);

test("an OR node needs any one of its wires: each alternative becomes its own rule", () => {
  const a = cond(emptyGraph(), 1, 1, 0);
  const b = cond(a.graph, 2, 1, 1);
  const buy = action(b.graph, "buy", 2, 0);
  let graph = wire(buy.graph, [[PRICE_ID, a.id], [PRICE_ID, b.id], [a.id!, buy.id], [b.id!, buy.id]]);
  assert.deepEqual(graphToRules(graph).rules.map((r) => r.conditions.length), [2]); // AND by default
  graph = setMode(graph, buy.id!, "or");
  const { rules, incomplete } = graphToRules(graph);
  assert.deepEqual(rules.map((r) => [r.id, r.conditions]), [[buy.id, [rsi(1)]], [`${buy.id}~1`, [rsi(2)]]]);
  assert.deepEqual(incomplete, []);
});

test("ORs and ANDs combine: (A or B) and C gives one rule per way", () => {
  const a = cond(emptyGraph(), 1, 1, 0);
  const b = cond(a.graph, 2, 1, 1);
  const c = cond(b.graph, 3, 1, 2);
  const d = cond(c.graph, 4, 2, 0);
  const buy = action(d.graph, "buy", 3, 0);
  // d is an OR from the start: as an AND it would already be 3 conditions and the action could not join C
  const graph = wire(setMode(buy.graph, d.id!, "or"), [[PRICE_ID, a.id], [PRICE_ID, b.id], [PRICE_ID, c.id], [a.id!, d.id], [b.id!, d.id], [d.id!, buy.id], [c.id!, buy.id]]);
  const { rules } = graphToRules(graph);
  assert.deepEqual(rules.map((r) => r.conditions.length), [3, 3]);
  assert.deepEqual(rules.map((r) => r.conditions.map((x) => (x.kind === "rsi" ? x.value : 0))), [[1, 3, 4], [2, 3, 4]]);
});

test("an OR can take more wires than the limit, since each rule only holds one way", () => {
  let graph = emptyGraph();
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const c = cond(graph, i + 1, 1, i);
    graph = connect(c.graph, PRICE_ID, c.id!, 3);
    ids.push(c.id!);
  }
  const buy = action(graph, "buy", 2, 0);
  graph = setMode(buy.graph, buy.id!, "or");
  for (const id of ids) graph = connect(graph, id, buy.id!, 3);
  assert.equal(graphToRules(graph).rules.length, 4);
  // the same four as an AND would be a rule of four: the switch refuses
  assert.equal(setMode(graph, buy.id!, "and"), graph);
});

test("an OR ignores a wire that does not come from the price, and flags it as incomplete", () => {
  const a = cond(emptyGraph(), 1, 1, 0);
  const loose = cond(a.graph, 2, 1, 1);
  const buy = action(loose.graph, "buy", 2, 0);
  let graph = wire(buy.graph, [[PRICE_ID, a.id], [a.id!, buy.id], [loose.id!, buy.id]]);
  assert.equal(graphToRules(graph).rules.length, 0); // AND: the loose condition spoils it
  graph = setMode(graph, buy.id!, "or");
  const { rules, incomplete } = graphToRules(graph);
  assert.equal(rules.length, 1);
  assert.deepEqual(incomplete, [loose.id]);
});

test("the mode is stored on conditions and actions, never on the price", () => {
  const graph = rulesToGraph([rule("a", "buy", rsi(1))]);
  assert.equal(setMode(graph, "a", "or").nodes.find((n) => n.id === "a")!.mode, "or");
  assert.equal(setMode(graph, PRICE_ID, "or").nodes.find((n) => n.id === PRICE_ID)!.mode, undefined);
});
