"use client"

import { useRef, useState } from "react"
import { XIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { shownColumns, usedColumns, type Graph, type GraphNode, type NodeType } from "@/lib/strategy-graph"
import { BuilderNode, nodeView } from "./builder-node"
import { canvasHeight, inPort, makeLayout, MIN_ROWS, nodeBox, outPort, wirePath } from "./builder-layout"

/** Wires follow their nodes while the layout moves (browsers without `d` transitions just jump). */
const wireMotion = { transition: "d 300ms ease-out" } as const

/**
 * The panel: a clean grid of invisible columns with the nodes of the graph and the wires between
 * them. With `readOnly` it only draws (built-in strategies); otherwise every interaction is a callback
 * of the builder, which owns the drag logic.
 */
function StrategyCanvas({
  graph,
  readOnly,
  invalid,
  dashed,
  selectedEdge,
  ghost,
  pending,
  connectTarget,
  columns,
  minRows = MIN_ROWS,
  className,
  canvasRef,
  onNodePress,
  onPortPress,
  onActivate,
  onToggleMode,
  onRemove,
  onEdgeSelect,
  onEdgeRemove,
}: {
  graph: Graph
  readOnly?: boolean
  /** Nodes with errors (conflicts, wrong values). */
  invalid?: ReadonlySet<string>
  /** Nodes outside a complete rule, shown after a save attempt. */
  dashed?: ReadonlySet<string>
  selectedEdge?: string | null
  /** Where a node being dragged would land. */
  ghost?: { type: NodeType; col: number; row: number } | null
  /** Wire being dragged from a port, in canvas coordinates. */
  pending?: { fromId: string; x: number; y: number } | null
  connectTarget?: string | null
  /** Columns the panel makes room for (default: those in use, plus a free one in the editor). */
  columns?: number
  /** Rows shown at least (the editor leaves room to place nodes; the read-only view fits its rules). */
  minRows?: number
  className?: string
  canvasRef?: React.Ref<HTMLDivElement>
  onNodePress?: (node: GraphNode, event: React.PointerEvent) => void
  onPortPress?: (node: GraphNode, event: React.PointerEvent) => void
  onActivate?: (node: GraphNode) => void
  onToggleMode?: (node: GraphNode) => void
  onRemove?: (node: GraphNode) => void
  onEdgeSelect?: (id: string | null) => void
  onEdgeRemove?: (id: string) => void
}) {
  const { locale, t } = useI18n()
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const maxRow = Math.max(...graph.nodes.map((n) => n.row), ghost?.row ?? 0)
  const rows = Math.max(minRows, maxRow + (readOnly ? 1 : 2))
  const from = pending ? nodeById.get(pending.fromId) : undefined
  const layout = makeLayout(columns ?? (readOnly ? usedColumns(graph) : shownColumns(graph)))
  const width = layout.width

  // No scrollbars: the panel is moved by dragging its background.
  const viewport = useRef<HTMLDivElement>(null)
  const [panning, setPanning] = useState(false)
  const startPan = (event: React.PointerEvent) => {
    if (event.target !== event.currentTarget || event.button !== 0) return
    onEdgeSelect?.(null)
    const el = viewport.current
    if (!el) return
    const startX = event.clientX
    const startY = event.clientY
    const left = el.scrollLeft
    const top = el.scrollTop
    setPanning(true)
    const move = (e: PointerEvent) => {
      el.scrollLeft = left - (e.clientX - startX)
      el.scrollTop = top - (e.clientY - startY)
    }
    const end = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      setPanning(false)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
  }

  return (
    <div ref={viewport} data-canvas className={cn("touch-none overflow-hidden rounded-xl border bg-card", className)}>
      <div
        ref={canvasRef}
        className={cn("relative select-none", panning ? "cursor-grabbing" : "cursor-grab")}
        style={{
          width,
          height: canvasHeight(rows),
          minWidth: "100%",
          transition: "width 300ms ease-out, height 300ms ease-out",
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        onPointerDown={startPan}
      >
        <svg className="pointer-events-none absolute inset-0 overflow-visible text-border-strong" width={width} height={canvasHeight(rows)} aria-hidden>
          {graph.edges.map((edge) => {
            const a = nodeById.get(edge.from)
            const b = nodeById.get(edge.to)
            if (!a || !b) return null
            const p1 = outPort(a, layout)
            const p2 = inPort(b, layout)
            const d = wirePath(p1.x, p1.y, p2.x, p2.y)
            const bad = invalid?.has(a.id) && invalid.has(b.id)
            return (
              <g key={edge.id}>
                <path
                  d={d}
                  fill="none"
                  strokeWidth={selectedEdge === edge.id ? 3 : 2}
                  strokeLinecap="round"
                  style={wireMotion}
                  className={cn(bad ? "stroke-down" : selectedEdge === edge.id ? "stroke-primary" : "stroke-current")}
                />
                {!readOnly && (
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ ...wireMotion, pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={() => onEdgeSelect?.(selectedEdge === edge.id ? null : edge.id)}
                  />
                )}
              </g>
            )
          })}
          {from && pending && (
            <path
              d={wirePath(outPort(from, layout).x, outPort(from, layout).y, pending.x, pending.y)}
              fill="none"
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinecap="round"
              className="stroke-primary"
            />
          )}
        </svg>

        {ghost && (
          <div
            aria-hidden
            className="absolute rounded-xl border-2 border-dashed border-primary/60 bg-primary/5"
            style={{ left: nodeBox(ghost, layout).x, top: nodeBox(ghost, layout).y, width: nodeBox(ghost, layout).w, height: nodeBox(ghost, layout).h }}
          />
        )}

        {graph.nodes.map((node) => (
          <BuilderNode
            key={node.id}
            node={node}
            layout={layout}
            view={nodeView(node, locale, t)}
            readOnly={readOnly}
            invalid={invalid?.has(node.id)}
            dashed={dashed?.has(node.id)}
            target={connectTarget === node.id}
            onPress={(event) => onNodePress?.(node, event)}
            onPortPress={(event) => onPortPress?.(node, event)}
            inputs={graph.edges.filter((e) => e.to === node.id).length}
            modeLabel={{
              and: t("Y", "AND"),
              or: t("O", "OR"),
              title: t(
                "Cómo se combinan las conexiones: Y = deben cumplirse todas, O = basta una",
                "How the wires combine: AND = all must hold, OR = any one is enough"
              ),
            }}
            onToggleMode={() => onToggleMode?.(node)}
            onActivate={node.type === "price" ? undefined : () => onActivate?.(node)}
            onRemove={node.type === "price" ? undefined : () => onRemove?.(node)}
            removeLabel={t("Eliminar nodo", "Delete node")}
          />
        ))}

        {!readOnly &&
          selectedEdge &&
          (() => {
            const edge = graph.edges.find((e) => e.id === selectedEdge)
            const a = edge && nodeById.get(edge.from)
            const b = edge && nodeById.get(edge.to)
            if (!edge || !a || !b) return null
            const p1 = outPort(a, layout)
            const p2 = inPort(b, layout)
            return (
              <button
                type="button"
                aria-label={t("Quitar conexión", "Remove connection")}
                onClick={() => onEdgeRemove?.(edge.id)}
                className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 motion-reduce:transition-none items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm outline-none hover:bg-down-soft hover:text-down focus-visible:ring-3 focus-visible:ring-ring/30"
                style={{ left: (p1.x + p2.x) / 2, top: (p1.y + p2.y) / 2 }}
              >
                <XIcon className="size-3.5" />
              </button>
            )
          })()}
      </div>
    </div>
  )
}

export { StrategyCanvas }
