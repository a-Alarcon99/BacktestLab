"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Trash2Icon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Field, Select } from "@/components/ui/input"
import { MAX_CONDITIONS, MAX_RULES, specOf } from "@/lib/strategy"
import {
  addNode,
  autoWire,
  canConnect,
  COLUMN_COUNT,
  connect,
  defaultRow,
  disconnect,
  moveNode,
  removeNode,
  setMode,
  shownColumns,
  sideOf,
  updateNode,
  usedColumns,
  type Graph,
  type GraphNode,
  type NodeData,
  type NodeType,
} from "@/lib/strategy-graph"
import { ConditionEditor, FieldError, NumberInput } from "../condition-fields"
import { cellAt, makeLayout } from "./builder-layout"
import { BuilderMenu } from "./builder-menu"
import type { DragPayload, PressHandler } from "./builder-types"
import { StrategyCanvas } from "./strategy-canvas"

type Update = (update: (graph: Graph) => Graph) => void

const DRAG_THRESHOLD = 5

/** A node just added joins its surroundings (see `autoWire`). */
const withWires = ({ graph, id }: { graph: Graph; id: string | null }) => (id ? autoWire(graph, id, MAX_CONDITIONS) : graph)

/**
 * Visual strategy editor: the component menu on the left and the panel next to it. Dragging only
 * edits the graph (`lib/strategy-graph.ts`); the form turns it back into the saved rules.
 */
function StrategyBuilder({
  graph,
  onChange,
  invalid,
  dashed,
  nodeErrors,
}: {
  graph: Graph
  onChange: Update
  invalid: ReadonlySet<string>
  dashed: ReadonlySet<string>
  /** Field errors per node id (conditions: by field name, amounts: `size`). */
  nodeErrors: ReadonlyMap<string, Record<string, string>>
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [label, setLabel] = useState<{ text: string; x: number; y: number } | null>(null)
  const [ghost, setGhost] = useState<{ type: NodeType; col: number; row: number } | null>(null)
  const [pending, setPending] = useState<{ fromId: string; x: number; y: number } | null>(null)
  const [connectTarget, setConnectTarget] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  // The panel makes room for the columns the strategy uses, plus a free one to drop nodes in.
  const columns = shownColumns(graph)

  // Window listeners of a press outlive the render that started it: they read the latest graph.
  const latest = useRef({ graph, onChange })
  useEffect(() => {
    latest.current = { graph, onChange }
  })

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : null
  }, [])
  const overCanvas = (clientX: number, clientY: number) =>
    Boolean(document.elementFromPoint(clientX, clientY)?.closest("[data-canvas]"))

  const cellFor = (type: NodeType, clientX: number, clientY: number) => {
    const point = toCanvas(clientX, clientY)
    return point && overCanvas(clientX, clientY) ? cellAt(type, point.x, point.y, makeLayout(shownColumns(latest.current.graph))) : null
  }

  /** A press that turns into a drag after a few pixels; below that it's a click. */
  const press: PressHandler = (event, payload: DragPayload, text, onClick) => {
    if (event.button !== 0) return
    const type: NodeType | undefined =
      payload.kind === "new" ? payload.data.type : latest.current.graph.nodes.find((n) => n.id === payload.id)?.type
    if (!type) return
    const startX = event.clientX
    const startY = event.clientY
    let dragging = false
    const finish = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", finish)
      setLabel(null)
      setGhost(null)
    }
    const move = (e: PointerEvent) => {
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return
      dragging = true
      setSelectedEdge(null)
      setLabel({ text, x: e.clientX, y: e.clientY })
      const cell = cellFor(type, e.clientX, e.clientY)
      setGhost(cell && { type, ...cell })
    }
    const up = (e: PointerEvent) => {
      finish()
      if (!dragging) return onClick()
      const cell = cellFor(type, e.clientX, e.clientY)
      if (!cell) return
      if (payload.kind === "new") latest.current.onChange((g) => withWires(addNode(g, payload.data, cell.col, cell.row, MAX_RULES)))
      else latest.current.onChange((g) => autoWire(moveNode(g, payload.id, cell.col, cell.row), payload.id, MAX_CONDITIONS))
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", finish)
  }

  /** Drags a wire out of a node's right port; it ends on any node it can legally feed. */
  const pressPort = (node: GraphNode, event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    setSelectedEdge(null)
    let target: string | null = null
    const finish = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      setPending(null)
      setConnectTarget(null)
    }
    const move = (e: PointerEvent) => {
      const point = toCanvas(e.clientX, e.clientY)
      if (point) setPending({ fromId: node.id, ...point })
      const id = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node]")?.dataset.node
      target = id && canConnect(latest.current.graph, node.id, id, MAX_CONDITIONS) ? id : null
      setConnectTarget(target)
    }
    const up = () => {
      const to = target
      finish()
      if (to) latest.current.onChange((g) => connect(g, node.id, to, MAX_CONDITIONS))
    }
    const cancel = () => finish()
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
  }

  const addFromMenu = (data: NodeData) =>
    onChange((g) => {
      // Conditions start at the first column; an action goes right after everything else.
      const col = data.type === "condition" ? 1 : Math.min(Math.max(usedColumns(g), 2), COLUMN_COUNT - 1)
      return withWires(addNode(g, data, col, defaultRow(g, col), MAX_RULES))
    })

  const remove = (node: GraphNode) => {
    onChange((g) => removeNode(g, node.id))
    setEditing((current) => (current === node.id ? null : current))
  }

  const removeEdge = (id: string) => {
    onChange((g) => disconnect(g, id))
    setSelectedEdge(null)
  }

  // Delete removes the wire that is selected, unless the user is typing.
  useEffect(() => {
    if (!selectedEdge) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(input|select|textarea)$/i.test(target.tagName)) return
      if (event.key === "Delete" || event.key === "Backspace") {
        latest.current.onChange((g) => disconnect(g, selectedEdge))
        setSelectedEdge(null)
      }
      if (event.key === "Escape") setSelectedEdge(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedEdge])

  const editingNode = graph.nodes.find((n) => n.id === editing)

  return (
    <div className="grid gap-4 lg:flex-1 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* The menu scrolls inside the height of the panel, so a longer menu never makes the panel taller. */}
      <div className="relative">
        <BuilderMenu press={press} onAdd={addFromMenu} />
      </div>

      {/* On desktop the panel ends level with the summary card: it stretches to the row and the hint hangs below it. */}
      <div className="relative flex min-w-0 flex-col gap-2 lg:self-stretch">
        <StrategyCanvas
          graph={graph}
          invalid={invalid}
          dashed={dashed}
          selectedEdge={selectedEdge}
          ghost={ghost}
          pending={pending}
          connectTarget={connectTarget}
          columns={columns}
          canvasRef={canvasRef}
          className="h-[28rem] lg:h-auto lg:min-h-[28rem] lg:flex-1"
          onNodePress={(node, event) => {
            press(event, { kind: "move", id: node.id }, node.type, () => {
              if (node.type !== "price") setEditing(node.id)
            })
          }}
          onPortPress={pressPort}
          onActivate={(node) => setEditing(node.id)}
          onToggleMode={(node) => onChange((g) => setMode(g, node.id, node.mode === "or" ? "and" : "or"))}
          onRemove={remove}
          onEdgeSelect={setSelectedEdge}
          onEdgeRemove={removeEdge}
        />
        <p className="text-caption text-muted-foreground lg:absolute lg:inset-x-0 lg:top-full lg:mt-2">
          {t(
            "Arrastra componentes al panel y conéctalos desde el punto derecho de cada nodo: una regla se dispara cuando se cumplen todas las condiciones conectadas a su compra o venta. Cuando un nodo recibe varias conexiones, el interruptor Y / O de su izquierda decide si deben cumplirse todas o basta una. Haz clic en una condición, compra o venta para editarla. Arrastra el fondo para moverte por el panel.",
            "Drag components onto the panel and connect them from the right-hand dot of each node: a rule fires when every condition wired to its buy or sell holds. When a node takes several wires, the AND / OR switch on its left decides whether all must hold or any one is enough. Click a condition, buy or sell to edit it. Drag the background to move around the panel."
          )}
        </p>
      </div>

      {label && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-primary bg-card px-2.5 py-1.5 text-caption font-semibold shadow-lg"
          style={{ left: label.x + 12, top: label.y + 12 }}
        >
          {label.text}
        </div>
      )}

      <Dialog open={Boolean(editingNode)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent
          className={
            editingNode?.type === "condition" && editingNode.condition.kind === "candle-pattern"
              ? "w-[min(60rem,calc(100vw-1.5rem))]"
              : "w-[min(36rem,calc(100vw-1.5rem))]"
          }
        >
          {editingNode && (
            <NodeEditor
              node={editingNode}
              graph={graph}
              errors={nodeErrors.get(editingNode.id) ?? {}}
              onUpdate={(patch) => onChange((g) => updateNode(g, editingNode.id, patch))}
              onRemove={() => remove(editingNode)}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Settings of a condition or of a buy/sell (its amount). */
function NodeEditor({
  node,
  graph,
  errors,
  onUpdate,
  onRemove,
  onClose,
}: {
  node: GraphNode
  graph: Graph
  errors: Record<string, string>
  onUpdate: (patch: Partial<NodeData>) => void
  onRemove: () => void
  onClose: () => void
}) {
  const { locale, t } = useI18n()
  // The side comes from the action the node leads to; a loose node is edited as a buy.
  const side = sideOf(graph, node.id) ?? "buy"
  const title =
    node.type === "condition"
      ? specOf(node.condition).name[locale]
      : node.type === "action" && node.side === "sell"
        ? t("Venta", "Sell")
        : t("Compra", "Buy")
  const description =
    node.type === "condition"
      ? t(
          "Se evalúa al cierre de cada vela; la orden se ejecuta a la apertura de la siguiente.",
          "Evaluated on the close of every candle; the order fills at the next candle's open."
        )
      : side === "buy"
        ? t("Cuánto comprar cuando se cumpla la regla.", "How much to buy when the rule fires.")
        : t("Qué parte de la posición vender cuando se cumpla la regla.", "How much of the position to sell when the rule fires.")

  return (
    <>
      <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-1 flex-col">
          <DialogTitle className="truncate text-title font-bold">{title}</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">{description}</DialogDescription>
        </div>
        <DialogClose />
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-5">
        {node.type === "condition" && (
          <ConditionEditor
            id={`node-${node.id}`}
            side={side}
            condition={node.condition}
            errors={errors}
            fieldsClassName="sm:grid-cols-2"
            hideKind
            onChange={(condition) => onUpdate({ type: "condition", condition })}
          />
        )}
        {node.type === "action" && node.side === "sell" && (
          <Field
            label={t("Porcentaje de la posición", "Percentage of the position")}
            htmlFor={`node-${node.id}-value`}
            hint={<FieldError show error={errors.size} />}
          >
            <NumberInput
              id={`node-${node.id}-value`}
              suffix="%"
              value={node.size.value}
              onValue={(value) => onUpdate({ type: "action", size: { unit: "pct", value } })}
            />
          </Field>
        )}
        {node.type === "action" && node.side === "buy" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("Tipo de cantidad", "Amount type")} htmlFor={`node-${node.id}-unit`}>
              <Select
                id={`node-${node.id}-unit`}
                value={node.size.unit}
                onChange={(event) => onUpdate({ type: "action", size: { unit: event.target.value as "pct" | "usdt", value: 100 } })}
              >
                <option value="pct">{t("% del efectivo", "% of the cash")}</option>
                <option value="usdt">{t("Importe fijo en USDT", "Fixed amount in USDT")}</option>
              </Select>
            </Field>
            <Field
              label={node.size.unit === "pct" ? t("Porcentaje", "Percentage") : t("Importe", "Amount")}
              htmlFor={`node-${node.id}-value`}
              hint={<FieldError show error={errors.size} />}
            >
              <NumberInput
                id={`node-${node.id}-value`}
                suffix={node.size.unit === "pct" ? "%" : "USDT"}
                value={node.size.value}
                onValue={(value) => onUpdate({ type: "action", size: { ...node.size, value } })}
              />
            </Field>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t px-4 py-3 md:px-5">
        <Button type="button" variant="ghost" className="hover:bg-down-soft hover:text-down" onClick={onRemove}>
          <Trash2Icon data-icon="inline-start" />
          {t("Eliminar nodo", "Delete node")}
        </Button>
        <Button type="button" onClick={onClose}>
          {t("Listo", "Done")}
        </Button>
      </footer>
    </>
  )
}

export { StrategyBuilder }
