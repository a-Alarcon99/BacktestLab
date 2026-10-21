import { columnsOf, MAX_ROW, type GraphNode, type NodeType } from "@/lib/strategy-graph"

// Geometry of the strategy canvas. Columns are invisible; every node sits in a cell (column × row),
// so wires and drop targets are computed from these numbers, not from the DOM. The panel only
// makes room for the columns the strategy uses plus a free one (`shownColumns`), so a small
// strategy is a short panel.

export const NODE_H = 88
export const ROW = 112
export const PAD_X = 40
export const PAD_Y = 40
export const GAP = 44
export const MIN_ROWS = 6

/** Width of a column: the price's is narrower. */
export const colW = (col: number) => (col === 0 ? 216 : 248)

export type Layout = { cols: number; colX: number[]; width: number }

/** Left edge of each of the first `cols` columns. */
export function makeLayout(cols: number): Layout {
  let x = PAD_X
  const colX = Array.from({ length: cols }, (_, col) => {
    const left = x
    x += colW(col) + GAP
    return left
  })
  return { cols, colX, width: x - GAP + PAD_X }
}

export const rowCy = (row: number) => PAD_Y + row * ROW + NODE_H / 2
export const canvasHeight = (rows: number) => PAD_Y * 2 + rows * ROW - (ROW - NODE_H)

export type Box = { x: number; y: number; w: number; h: number }
type Placed = Pick<GraphNode, "type" | "col" | "row">

export function nodeBox(node: Placed, layout: Layout): Box {
  const col = Math.min(node.col, layout.cols - 1)
  return { x: layout.colX[col], y: rowCy(node.row) - NODE_H / 2, w: colW(col), h: NODE_H }
}

export const inPort = (node: Placed, layout: Layout) => {
  const b = nodeBox(node, layout)
  return { x: b.x, y: b.y + b.h / 2 }
}
export const outPort = (node: Placed, layout: Layout) => {
  const b = nodeBox(node, layout)
  return { x: b.x + b.w, y: b.y + b.h / 2 }
}

/** Shown cell of a type nearest to a point of the canvas: its own column closest in x, any row. */
export function cellAt(type: NodeType, x: number, y: number, layout: Layout) {
  const cols = columnsOf(type).filter((c) => c < layout.cols)
  if (cols.length === 0) return null
  const center = (c: number) => layout.colX[c] + colW(c) / 2
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
