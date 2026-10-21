import type { Condition, OrderSize, Rule, RuleSide } from "./strategy.ts"

// Node graph behind the visual strategy builder (components/strategy/builder). The saved model is
// still `Rule[]`: every action node is one rule (or several, with ORs), made of the conditions that
// lead to it (`graphToRules`), and every rule can be laid out again as a chain (`rulesToGraph`). Positions are
// only used by the editor. Type-only imports keep this module free of the app's `@/` alias, so
// `node --test` can load it.
//
// A wire means "both must hold" by default: a condition (or an action) with several conditions wired
// into it needs all of them, and so do the conditions behind those. Each node can instead take its
// wires as an OR (`mode`): any one is enough, which saves as one rule per alternative. A condition can feed any number of
// conditions and actions. Wires always go to a column further right; nodes sit in any column but the
// first, which belongs to the price.

export type NodeType = "price" | "condition" | "action"

export type NodeData = { type: "condition"; condition: Condition } | { type: "action"; side: RuleSide; size: OrderSize }

/** How a node combines the wires coming into it: all must hold ("and", default) or any one ("or"). */
export type InputMode = "and" | "or"

type Placed = { id: string; col: number; row: number; mode?: InputMode }
export type GraphNode = Placed & (NodeData | { type: "price" })
export type GraphEdge = { id: string; from: string; to: string }
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] }

/** Column 0 is the price's; conditions and actions go in any of the others. */
export const COLUMN_COUNT = 6
export const FREE_COLUMNS = Array.from({ length: COLUMN_COUNT - 1 }, (_, i) => i + 1)
export const MAX_ROW = 23
export const MAX_NODES = 80
export const PRICE_ID = "price"

/** Columns a node type can be placed in. */
export const columnsOf = (type: NodeType) => (type === "price" ? [0] : FREE_COLUMNS)

/** What each node type can feed (a wire always goes to a column further right). */
const FLOW: Record<NodeType, NodeType[]> = {
  price: ["condition"],
  condition: ["condition", "action"],
  action: [],
}

/** Conditions a rule can hold. */
const PATH_CONDITIONS = 3

const byId = (graph: Graph, id: string) => graph.nodes.find((n) => n.id === id)
const newId = () => crypto.randomUUID()

type Cond = Extract<GraphNode, { type: "condition" }>
type Action = Extract<GraphNode, { type: "action" }>

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
      const id = `${rule.id}:c${k}`
      nodes.push({ id, type: "condition", col: 1 + k, row, condition })
      link(id)
    })
    nodes.push({ id: rule.id, type: "action", col: 1 + rule.conditions.length, row, side: rule.side, size: rule.size })
    link(rule.id)
  })
  return { nodes, edges }
}

/** Nodes wired into a node (the price included). */
const feeders = (graph: Graph, id: string) =>
  graph.edges.flatMap((e) => (e.to === id ? [byId(graph, e.from)] : [])).filter((n): n is GraphNode => n !== undefined)

/** A way for a node to fire: conditions that must all hold, in reading order. */
type Alternative = Cond[]
const MAX_ALTERNATIVES = 24
const TOO_MANY = "many"

const withAll = (base: Alternative, more: Alternative) => [...base, ...more.filter((c) => !base.includes(c))]
const reading = (alt: Alternative) => [...alt].sort((a, b) => a.col - b.col || a.row - b.row)

/**
 * The ways a node can fire, as alternatives (each a set of conditions that must all hold), or `null`
 * when it is not wired back to the price. A node's wires in combine as its mode says: "and" (default)
 * needs all of them, "or" needs any one. A condition adds itself to every alternative; an action
 * needs at least one condition. `"many"` when the alternatives would multiply past a sane number.
 */
function alternatives(graph: Graph, node: GraphNode, guard = 0): Alternative[] | null | typeof TOO_MANY {
  if (guard > COLUMN_COUNT || node.type === "price") return null
  const parts: Alternative[][] = []
  for (const source of feeders(graph, node.id)) {
    if (source.type === "price") {
      parts.push([[]])
      continue
    }
    const behind = alternatives(graph, source, guard + 1)
    if (behind === TOO_MANY) return TOO_MANY
    if (behind) parts.push(behind)
    else if ((node.mode ?? "and") === "and") return null
  }
  if (parts.length === 0) return null
  let result: Alternative[]
  if (node.mode === "or") {
    result = parts.flat()
  } else {
    result = [[]]
    for (const part of parts) {
      result = result.flatMap((base) => part.map((alt) => withAll(base, alt)))
      if (result.length > MAX_ALTERNATIVES) return TOO_MANY
    }
  }
  if (node.type === "condition") result = result.map((alt) => withAll(alt, [node]))
  const unique = new Map(result.filter((alt) => alt.length > 0).map((alt) => [reading(alt).map((c) => c.id).join("|"), reading(alt)]))
  if (unique.size > MAX_ALTERNATIVES) return TOO_MANY
  return unique.size > 0 ? [...unique.values()] : null
}

export type GraphRules = {
  rules: Rule[]
  /** Nodes (other than the price) that are not part of any complete rule. */
  incomplete: string[]
  /** Per rule: the node of each of its conditions (in order) and the buy/sell node it belongs to. */
  parts: Map<string, { conditions: string[]; action: string }>
}

/**
 * Reads every buy/sell as rules: the conditions wired to it must hold, each node combining its wires
 * with AND or OR (`mode`). Alternatives (from ORs) become separate rules, since every saved rule is a
 * plain AND. The first rule of an action keeps its id, the others get `<id>~<n>`. An action without
 * conditions, or fed by a condition not wired back to the price, makes no rule. Ordered by action row.
 */
export function graphToRules(graph: Graph): GraphRules {
  const actions = graph.nodes.filter((n): n is Action => n.type === "action")
  actions.sort((a, b) => a.row - b.row || a.col - b.col)
  const parts = new Map<string, { conditions: string[]; action: string }>()
  const used = new Set<string>()
  const rules: Rule[] = []
  for (const action of actions) {
    const found = alternatives(graph, action)
    if (!found || found === TOO_MANY) continue
    found
      .filter((conditions) => conditions.length <= PATH_CONDITIONS)
      .forEach((conditions, n) => {
        const id = n === 0 ? action.id : `${action.id}~${n}`
        parts.set(id, { conditions: conditions.map((c) => c.id), action: action.id })
        conditions.forEach((c) => used.add(c.id))
        used.add(action.id)
        rules.push({ id, side: action.side, conditions: conditions.map((c) => c.condition), size: action.size })
      })
  }
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

/** Drops the wires that no longer go to a column further right (after a node moved). */
function tidy(graph: Graph): Graph {
  const edges = graph.edges.filter((e) => {
    const a = byId(graph, e.from)
    const b = byId(graph, e.to)
    return a && b && a.col < b.col
  })
  return edges.length === graph.edges.length ? graph : { ...graph, edges }
}

/** Adds a node in a column of its type (the nearest free row). `null` id when it can't be added. */
export function addNode(graph: Graph, data: NodeData, col: number, row: number, maxRules: number) {
  const actions = graph.nodes.filter((n) => n.type === "action").length
  if (!columnsOf(data.type).includes(col) || graph.nodes.length >= MAX_NODES) return { graph, id: null }
  if (data.type === "action" && actions >= maxRules) return { graph, id: null }
  const id = newId()
  const node = { id, col, row: freeRow(graph, col, row), ...data } as GraphNode
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, id }
}

/**
 * Moves a node to a column of its type and the nearest free row. Wires that would then go back (to
 * a column at its left or its own) are removed, so the node can be wired again where it now is.
 */
export function moveNode(graph: Graph, id: string, col: number, row: number): Graph {
  const node = byId(graph, id)
  if (!node || !columnsOf(node.type).includes(col)) return graph
  const placed = freeRow(graph, col, row, id)
  return tidy({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, col, row: placed } : n)) })
}

/** Edits the data of a node (a condition, an action's amount…). */
export function updateNode(graph: Graph, id: string, patch: Partial<NodeData>): Graph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as GraphNode) : n)) }
}

/** The default price node can't be removed. */
export function removeNode(graph: Graph, id: string): Graph {
  if (id === PRICE_ID) return graph
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  }
}

export function disconnect(graph: Graph, edgeId: string): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) }
}

/**
 * Whether `from → to` is a valid wire: allowed types, towards a column further right, not repeated,
 * and no rule (condition or action with everything behind it) ends up with more than `max` conditions.
 */
export function canConnect(graph: Graph, fromId: string, toId: string, max: number) {
  const from = byId(graph, fromId)
  const to = byId(graph, toId)
  if (!from || !to || from.id === to.id) return false
  if (!FLOW[from.type].includes(to.type) || from.col >= to.col) return false
  if (graph.edges.some((e) => e.from === fromId && e.to === toId)) return false
  const wired = { ...graph, edges: [...graph.edges, { id: "?", from: fromId, to: toId }] }
  return wired.nodes.every((n) => {
    if (n.type === "price") return true
    const found = alternatives(wired, n)
    return found !== TOO_MANY && (found ?? []).every((alt) => alt.length <= max)
  })
}

/** Adds a wire (any node can take and give several). */
export function connect(graph: Graph, fromId: string, toId: string, max: number): Graph {
  if (!canConnect(graph, fromId, toId, max)) return graph
  return { ...graph, edges: [...graph.edges, { id: newId(), from: fromId, to: toId }] }
}

/** Sets how a node combines its wires in (AND / OR); refused if some rule would then hold too many conditions. */
export function setMode(graph: Graph, id: string, mode: InputMode, max = PATH_CONDITIONS): Graph {
  const next = { ...graph, nodes: graph.nodes.map((n) => (n.id === id && n.type !== "price" ? { ...n, mode } : n)) }
  const fits = next.nodes.every((n) => {
    if (n.type === "price") return true
    const found = alternatives(next, n)
    return found !== TOO_MANY && (found ?? []).every((alt) => alt.length <= max)
  })
  return fits ? next : graph
}

/** Side of the first action a node leads to (following its wires forward), if it is wired to one. */
export function sideOf(graph: Graph, id: string): RuleSide | undefined {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length > 0) {
    const current = byId(graph, stack.pop()!)
    if (!current || seen.has(current.id)) continue
    seen.add(current.id)
    if (current.type === "action") return current.side
    for (const edge of graph.edges) if (edge.from === current.id) stack.push(edge.to)
  }
  return undefined
}

/** Columns in use: the one of the rightmost node, counting the price's. */
export function usedColumns(graph: Graph) {
  return Math.max(0, ...graph.nodes.map((n) => n.col)) + 1
}

/** Columns the editor shows: the ones in use plus one free on the right, at least 3 and at most all. */
export function shownColumns(graph: Graph) {
  return Math.min(Math.max(usedColumns(graph) + 1, 3), COLUMN_COUNT)
}

/** Rows a node added without choosing one goes to, in this order: 2nd, 3rd, 1st and 4th (then the nearest free). */
const DEFAULT_ROWS = [1, 2, 0, 3]

export function defaultRow(graph: Graph, col: number) {
  const taken = new Set(graph.nodes.filter((n) => n.col === col).map((n) => n.row))
  return DEFAULT_ROWS.find((row) => !taken.has(row)) ?? freeRow(graph, col, DEFAULT_ROWS[0])
}

/**
 * Wires a node that was just added or moved: a condition of the first column joins the price (unless
 * it already has a wire in). Everything else is wired by hand.
 */
export function autoWire(graph: Graph, id: string, max: number): Graph {
  const node = byId(graph, id)
  if (node?.type !== "condition" || node.col !== 1 || graph.edges.some((e) => e.to === id)) return graph
  return connect(graph, PRICE_ID, id, max)
}
