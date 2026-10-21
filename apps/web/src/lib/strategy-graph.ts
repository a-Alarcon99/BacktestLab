import type { Condition, OrderSize, Rule, RuleSide } from "./strategy.ts"

// Node graph behind the visual strategy builder (components/strategy/builder). The saved model is
// still `Rule[]`: every chain  price → condition (→ AND → condition)* → amount → action  is one rule
// (`graphToRules`; the conditions wired into an AND all belong to the rule, several conditions into an amount or out of an AND give one rule each) and every rule can be laid out again as a chain (`rulesToGraph`). Positions are
// only used by the editor. Type-only imports keep this module free of the app's `@/` alias, so
// `node --test` can load it.

export type NodeType = "price" | "condition" | "and" | "amount" | "action"

export type NodeData =
  | { type: "condition"; condition: Condition }
  | { type: "and" }
  | { type: "amount"; size: OrderSize }
  | { type: "action"; side: RuleSide }

type Placed = { id: string; col: number; row: number }
export type GraphNode = Placed & (NodeData | { type: "price" })
export type GraphEdge = { id: string; from: string; to: string }
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] }

/** Invisible columns: each node type lives in its own, in this order. */
export const COLUMNS: Record<NodeType, number[]> = {
  price: [0],
  condition: [1, 3, 5],
  and: [2, 4],
  amount: [6],
  action: [7],
}
export const COLUMN_COUNT = 8
export const MAX_ROW = 23
export const MAX_NODES = 80
export const PRICE_ID = "price"

/** What each node type can feed (a wire always goes to a column further right). */
const FLOW: Record<NodeType, NodeType[]> = {
  price: ["condition"],
  condition: ["and", "amount"],
  and: ["condition"],
  amount: ["action"],
  action: [],
}

const byId = (graph: Graph, id: string) => graph.nodes.find((n) => n.id === id)
const newId = () => crypto.randomUUID()

export function emptyGraph(): Graph {
  return { nodes: [{ id: PRICE_ID, type: "price", col: 0, row: 1 }], edges: [] }
}

/**
 * Lays rules out as chains, one row each, in the order given, from row `firstRow` (the editor leaves
 * row 0 free; a read-only view starts at 0). Ids are deterministic.
 */
export function rulesToGraph(rules: Rule[], firstRow = 1): Graph {
  if (rules.length === 0) return emptyGraph()
  const nodes: GraphNode[] = [{ id: PRICE_ID, type: "price", col: 0, row: firstRow + Math.floor((rules.length - 1) / 2) }]
  const edges: GraphEdge[] = []
  rules.forEach((rule, index) => {
    const row = index + firstRow
    let previous = PRICE_ID
    const link = (to: string) => {
      edges.push({ id: `${previous}>${to}`, from: previous, to })
      previous = to
    }
    rule.conditions.forEach((condition, k) => {
      if (k > 0) {
        const and = `${rule.id}:and${k}`
        nodes.push({ id: and, type: "and", col: 2 * k, row })
        link(and)
      }
      const id = `${rule.id}:c${k}`
      nodes.push({ id, type: "condition", col: 1 + 2 * k, row, condition })
      link(id)
    })
    const amount = `${rule.id}:amount`
    nodes.push({ id: amount, type: "amount", col: 6, row, size: rule.size })
    link(amount)
    nodes.push({ id: rule.id, type: "action", col: 7, row, side: rule.side })
    link(rule.id)
  })
  return { nodes, edges }
}

export type GraphRules = {
  rules: Rule[]
  /** Nodes (other than the price) that are not part of any complete rule. */
  incomplete: string[]
  /** Per rule: the node of each of its conditions (in order) and of its amount. */
  parts: Map<string, { conditions: string[]; amount: string }>
}

/** Conditions a rule can hold. */
const PATH_CONDITIONS = 3

const MAX_PATHS = 200

type Cond = Extract<GraphNode, { type: "condition" }>

/**
 * What a condition needs to fire: the conditions that must all hold (in reading order) and the nodes
 * (conditions and ANDs) that make that up, or `null` when it isn't wired back to the price. An AND
 * needs *every* condition wired into it, plus the one it feeds: two in and two out are two rules
 * (`A+B+C`, `A+B+D`), not four. A condition has a single wire in, so there is a single answer.
 */
function requirements(graph: Graph, node: GraphNode, guard = 0): { conditions: Cond[]; nodes: string[] } | null {
  if (guard > 24) return null
  const into = graph.edges.filter((e) => e.to === node.id).flatMap((e) => (byId(graph, e.from) ? [byId(graph, e.from)!] : []))
  if (node.type === "condition") {
    const source = into[0]
    if (!source) return null
    let before: { conditions: Cond[]; nodes: string[] } | null = { conditions: [], nodes: [] }
    if (source.type === "and") before = requirements(graph, source, guard + 1)
    else if (source.type !== "price") return null
    if (!before) return null
    return { conditions: [...before.conditions, node], nodes: [...before.nodes, node.id] }
  }
  if (node.type !== "and" || into.length === 0) return null
  const conditions: Cond[] = []
  const nodes = [node.id]
  for (const input of [...into].sort((x, y) => x.row - y.row)) {
    if (input.type !== "condition") return null
    const part = requirements(graph, input, guard + 1)
    if (!part) return null
    for (const c of part.conditions) if (!conditions.includes(c)) conditions.push(c)
    nodes.push(...part.nodes)
  }
  return { conditions, nodes }
}

/**
 * Reads every complete chain price → condition (→ AND → condition)* → amount → action as one rule.
 * An AND is a real "and": the conditions wired into it all belong to every rule that leaves it. Only
 * several conditions into one amount, or several conditions out of an AND, give several rules. The
 * first rule of an action keeps its id; the others get `<id>~<n>`. Ordered by action row.
 */
export function graphToRules(graph: Graph): GraphRules {
  const found: { action: Extract<GraphNode, { type: "action" }>; amount: Extract<GraphNode, { type: "amount" }>; conditions: Cond[]; used: string[] }[] = []
  for (const amount of graph.nodes) {
    if (amount.type !== "amount") continue
    const action = graph.edges.flatMap((e) => (e.from === amount.id ? [byId(graph, e.to)] : [])).find((n) => n?.type === "action")
    if (action?.type !== "action") continue
    for (const edge of graph.edges) {
      if (edge.to !== amount.id) continue
      const last = byId(graph, edge.from)
      if (last?.type !== "condition") continue
      const needs = requirements(graph, last)
      if (!needs || needs.conditions.length > PATH_CONDITIONS || found.length >= MAX_PATHS) continue
      found.push({ action, amount, conditions: needs.conditions, used: [...needs.nodes, amount.id, action.id] })
    }
  }

  found.sort((a, b) => a.action.row - b.action.row || a.action.col - b.action.col || a.conditions[a.conditions.length - 1].row - b.conditions[b.conditions.length - 1].row)
  const parts = new Map<string, { conditions: string[]; amount: string }>()
  const used = new Set<string>()
  const count = new Map<string, number>()
  const rules = found.map(({ action, amount, conditions, used: nodes }) => {
    const n = count.get(action.id) ?? 0
    count.set(action.id, n + 1)
    const id = n === 0 ? action.id : `${action.id}~${n}`
    parts.set(id, { conditions: conditions.map((c) => c.id), amount: amount.id })
    nodes.forEach((p) => used.add(p))
    return { id, side: action.side, conditions: conditions.map((c) => c.condition), size: amount.size }
  })
  const incomplete = graph.nodes.filter((n) => n.type !== "price" && !used.has(n.id)).map((n) => n.id)
  return { rules, incomplete, parts }
}

/** Row nearest to `row` that no other node of the column uses. */
export function freeRow(graph: Graph, col: number, row: number, ignoreId?: string) {
  const taken = new Set(graph.nodes.filter((n) => n.col === col && n.id !== ignoreId).map((n) => n.row))
  const start = Math.min(Math.max(Math.round(row), 0), MAX_ROW)
  for (let d = 0; d <= MAX_ROW; d++) {
    for (const r of d === 0 ? [start] : [start + d, start - d]) {
      if (r >= 0 && r <= MAX_ROW && !taken.has(r)) return r
    }
  }
  return start
}

/** Adds a node in a column of its type (the nearest free row). `null` id when it can't be added. */
export function addNode(graph: Graph, data: NodeData, col: number, row: number, maxRules: number) {
  const actions = graph.nodes.filter((n) => n.type === "action").length
  if (!COLUMNS[data.type].includes(col) || graph.nodes.length >= MAX_NODES) return { graph, id: null }
  if (data.type === "action" && actions >= maxRules) return { graph, id: null }
  const id = newId()
  const node = { id, col, row: freeRow(graph, col, row), ...data } as GraphNode
  return { graph: arrange({ ...graph, nodes: [...graph.nodes, node] }), id }
}

/**
 * Moves a node to a column of its type and the nearest free row (wired nodes snap back to their chain
 * column). A condition dropped in another condition column is taken out of its chain (its wires in
 * and to ANDs are removed, the one to an amount stays), so it can be wired again at its new depth.
 */
export function moveNode(graph: Graph, id: string, col: number, row: number): Graph {
  const node = byId(graph, id)
  if (!node || !COLUMNS[node.type].includes(col)) return graph
  const placed = freeRow(graph, col, row, id)
  const detach = node.type === "condition" && node.col !== col
  const edges = detach ? graph.edges.filter((e) => e.to !== id && !(e.from === id && byId(graph, e.to)?.type === "and")) : graph.edges
  return arrange({ edges, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, col, row: placed } : n)) })
}

/** Edits the data of a node (a condition, an amount…). */
export function updateNode(graph: Graph, id: string, patch: Partial<NodeData>): Graph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as GraphNode) : n)) }
}

/** The default price node can't be removed. */
export function removeNode(graph: Graph, id: string): Graph {
  if (id === PRICE_ID) return graph
  return arrange({
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  })
}

export function disconnect(graph: Graph, edgeId: string): Graph {
  return arrange({ ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) })
}

/** Most conditions on a path ending at (back) or starting from (forward) a node, the node included. */
function chainConditions(graph: Graph, node: GraphNode, dir: "back" | "forward", guard = 0): number {
  if (guard > 30) return 0
  let best = 0
  for (const edge of graph.edges) {
    if (dir === "back" ? edge.to !== node.id : edge.from !== node.id) continue
    const next = byId(graph, dir === "back" ? edge.from : edge.to)
    if (next && next.type !== "price") best = Math.max(best, chainConditions(graph, next, dir, guard + 1))
  }
  return best + (node.type === "condition" ? 1 : 0)
}

/** Types that take several wires in (an AND, an amount) or give several out (the price, an AND; a condition only to ANDs). */
const MANY_IN: NodeType[] = ["and", "amount"]
const MANY_OUT: NodeType[] = ["price", "and"]

/**
 * Whether `from → to` is a valid wire: allowed types, no loop, at most `max` conditions on a path,
 * and an AND only joins conditions at the same depth (so they share a column).
 */
export function canConnect(graph: Graph, fromId: string, toId: string, max: number) {
  const from = byId(graph, fromId)
  const to = byId(graph, toId)
  if (!from || !to || from.id === to.id) return false
  if (!FLOW[from.type].includes(to.type) || reaches(graph, toId, fromId)) return false
  if (graph.edges.some((e) => e.from === fromId && e.to === toId)) return false
  if (chainConditions(graph, from, "back") + chainConditions(graph, to, "forward") > max) return false
  if (to.type === "and") {
    const depth = chainConditions(graph, from, "back")
    for (const e of graph.edges) {
      const other = e.to === toId ? byId(graph, e.from) : undefined
      if (other && chainConditions(graph, other, "back") !== depth) return false
    }
  }
  // Every rule can hold `max` conditions: an AND adds all the conditions wired into it.
  const wired = { ...graph, edges: [...graph.edges, { id: "?", from: fromId, to: toId }] }
  return wired.nodes.every((n) => n.type !== "condition" || (requirements(wired, n)?.conditions.length ?? 0) <= max)
}

/**
 * Adds a wire. Conditions, the amount and the action take one wire in; a condition gives one wire out to an amount and any number to ANDs; the price and an AND
 * can give several out, an AND and an amount can take several in. A wire on a single-wire port is replaced.
 * A fixed amount that ends up feeding a sell becomes a percentage (sells only accept %).
 */
export function connect(graph: Graph, fromId: string, toId: string, max: number): Graph {
  if (!canConnect(graph, fromId, toId, max)) return graph
  const from = byId(graph, fromId)!
  const to = byId(graph, toId)!
  // A condition may feed several ANDs plus one amount: a new wire only replaces one of the same kind.
  const sameOut = (e: GraphEdge) => e.from === fromId && (from.type !== "condition" || byId(graph, e.to)?.type === to.type)
  const edges = graph.edges.filter((e) => (MANY_IN.includes(to.type) || e.to !== toId) && (MANY_OUT.includes(from.type) || (from.type === "condition" && to.type === "and") || !sameOut(e)))
  const sellInUsdt = from.type === "amount" && from.size.unit !== "pct" && to.type === "action" && to.side === "sell"
  const nodes = sellInUsdt ? graph.nodes.map((n) => (n.id === fromId ? { ...n, size: { unit: "pct", value: 100 } } : n)) : graph.nodes
  return arrange({ nodes: nodes as GraphNode[], edges: [...edges, { id: newId(), from: fromId, to: toId }] })
}

/** Side of the action a node leads to (following its wires forward), if it is wired to one. */
export function sideOf(graph: Graph, id: string): RuleSide | undefined {
  let current = byId(graph, id)
  for (let step = 0; current && step < 24; step++) {
    if (current.type === "action") return current.side
    const from: string = current.id
    const edge = graph.edges.find((e) => e.from === from)
    current = edge ? byId(graph, edge.to) : undefined
  }
  return undefined
}

function reaches(graph: Graph, start: string, goal: string) {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === goal) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const edge of graph.edges) if (edge.from === id) stack.push(edge.to)
  }
  return false
}

/**
 * Puts every wired node in the column its place in the chain asks for (price, condition 1, AND,
 * condition 2…, amount, action), so wiring or deleting nodes re-lays the panel by itself. Loose
 * nodes stay where they are; nodes that change column take the nearest free row.
 */
export function arrange(graph: Graph): Graph {
  const wanted = new Map<string, number>()
  const place = (id: string, col: number, guard: number) => {
    const node = byId(graph, id)
    if (!node || guard > 12 || wanted.has(id) || !COLUMNS[node.type].includes(col)) return
    wanted.set(id, col)
    for (const edge of graph.edges) {
      if (edge.from !== id) continue
      const next = byId(graph, edge.to)
      if (next) place(next.id, next.type === "amount" ? 6 : next.type === "action" ? 7 : col + 1, guard + 1)
    }
  }
  for (const start of graph.edges.filter((e) => e.from === PRICE_ID)) place(start.to, 1, 0)
  let result = graph
  for (const [id, col] of wanted) {
    const node = byId(result, id)
    if (!node || node.col === col) continue
    const row = freeRow(result, col, node.row, id)
    result = { ...result, nodes: result.nodes.map((n) => (n.id === id ? { ...n, col, row } : n)) }
  }
  return result
}

/** Conditions the panel has room for in a row (1–3): an AND already reserves the next condition. */
export function levelsOf(graph: Graph): 1 | 2 | 3 {
  let levels = 1
  for (const n of graph.nodes) {
    if (n.type === "condition") levels = Math.max(levels, (n.col + 1) / 2)
    else if (n.type === "and") levels = Math.max(levels, n.col / 2 + 1)
  }
  return Math.min(levels, 3) as 1 | 2 | 3
}

/** Columns of a type that are visible when the panel has `levels` condition slots. */
export function columnsFor(type: NodeType, levels: number): number[] {
  const visible = (col: number) => col <= 2 * levels - 1 || col >= 6
  return COLUMNS[type].filter(visible)
}

/** Rows a node added without choosing one goes to, in this order: 2nd, 3rd, 1st and 4th (then the nearest free). */
const DEFAULT_ROWS = [1, 2, 0, 3]

export function defaultRow(graph: Graph, col: number) {
  const taken = new Set(graph.nodes.filter((n) => n.col === col).map((n) => n.row))
  return DEFAULT_ROWS.find((row) => !taken.has(row)) ?? freeRow(graph, col, DEFAULT_ROWS[0])
}

/**
 * Wires a node that was just added or moved: a condition of the first condition column joins the
 * price (unless it already has a wire in). Everything else is wired by hand.
 */
export function autoWire(graph: Graph, id: string, max: number): Graph {
  const node = byId(graph, id)
  if (node?.type !== "condition" || node.col !== 1 || graph.edges.some((e) => e.to === id)) return graph
  return connect(graph, PRICE_ID, id, max)
}
