import type { NodeData } from "@/lib/strategy-graph"

/** Something being dragged: a menu entry (creates a node) or a node already on the canvas. */
export type DragPayload = { kind: "new"; data: NodeData } | { kind: "move"; id: string }

/** Starts a press that becomes a drag after a few pixels, or a click otherwise. */
export type PressHandler = (event: React.PointerEvent, payload: DragPayload, label: string, onClick: () => void) => void
