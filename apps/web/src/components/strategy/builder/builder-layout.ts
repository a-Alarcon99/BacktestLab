import { columnsFor, MAX_ROW, type GraphNode, type NodeType } from "@/lib/strategy-graph"

// Geometry of the strategy canvas. Columns are invisible; every node sits in a cell (column × row),
// so wires and drop targets are computed from these numbers, not from the DOM. The condition
// columns only take room when the strategy uses them (`levels`, see `levelsOf`): with one condition
// the panel is price → condition → amount → action.

export const NODE_H = 88
export const AND_H = 44
export const ROW = 112
export const PAD_X = 40
export const PAD_Y = 40
export const GAP = 44
export const MIN_ROWS = 6

/** Width of each logical column (see `COLUMNS` in lib/strategy-graph.ts). */
export const colW = [216, 248, 60, 248, 60, 248, 208, 184]

export type Layout = { levels: number; colX: (number | undefined)[]; width: number }

/** Left edge of each visible column for a panel with `levels` condition slots (hidden columns take no room). */
export function makeLayout(levels: number): Layout {
  const visible = colW.map((_, col) => col <= 2 * levels - 1 || col >= 6)
  let x = PAD_X
  const colX = colW.map((w, col) => {
    if (!visible[col]) return undefined
    const left = x
    x += w + GAP
    return left
  })
  return { levels, colX, width: x - GAP + PAD_X }
}

export const rowCy = (row: number) => PAD_Y + row * ROW + NODE_H / 2
export const canvasHeight = (rows: number) => PAD_Y * 2 + rows * ROW - (ROW - NODE_H)

export type Box = { x: number; y: number; w: number; h: number }
type Placed = Pick<GraphNode, "type" | "col" | "row">

export function nodeBox(node: Placed, layout: Layout): Box {
  const h = node.type === "and" ? AND_H : NODE_H
  // A node is never in a hidden column; fall back to the amount column just in case.
  const x = layout.colX[node.col] ?? layout.colX[6]!
  return { x, y: rowCy(node.row) - h / 2, w: colW[node.col], h }
}

export const inPort = (node: Placed, layout: Layout) => {
  const b = nodeBox(node, layout)
  return { x: b.x, y: b.y + b.h / 2 }
}
export const outPort = (node: Placed, layout: Layout) => {
  const b = nodeBox(node, layout)
  return { x: b.x + b.w, y: b.y + b.h / 2 }
}

/** Visible cell of a type nearest to a point of the canvas: its own column closest in x, any row. */
export function cellAt(type: NodeType, x: number, y: number, layout: Layout) {
  const cols = columnsFor(type, layout.levels)
  if (cols.length === 0) return null
  const center = (c: number) => (layout.colX[c] ?? 0) + colW[c] / 2
  const col = cols.reduce((best, c) => (Math.abs(x - center(c)) < Math.abs(x - center(best)) ? c : best))
  const row = Math.min(Math.max(Math.round((y - PAD_Y - NODE_H / 2) / ROW), 0), MAX_ROW)
  return { col, row }
}

/** Cubic Bézier between two ports, leaving and entering horizontally. */
export function wirePath(x1: number, y1: number, x2: number, y2: number) {
  if (y1 === y2) return `M ${x1} ${y1} L ${x2} ${y2}`
  const dx = Math.max(Math.abs(x2 - x1) / 2, 24)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
