"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"
import { easeInOutCubic, lerp, phase } from "@/lib/chart-geometry"
import { DOCK_TARGETS, dockIds, Tile, type DockId, type TileSpec } from "./live-panels"

/*
 * The "dock": when the replay ends, the live tiles that repeat a key figure (capital, versus buy
 * and hold, max drawdown, winning trades) glide to their card in the key figures. Like the rest
 * of the cabin it is a pure function of one number: `u`, 0 → 1.
 */

/** The tiles fly one after the other. */
const flight = (u: number, k: number) => easeInOutCubic(phase(u, 0.04 + 0.06 * k, 0.62))

/** The tiles' frame fades out as they leave. */
export const dockFade = (u: number) => phase(u, 0, 0.25)

/** The column that held the tiles shrinks to nothing (1 → 0). */
export const dockRest = (u: number) => 1 - easeInOutCubic(phase(u, 0.3, 0.6))

/** The key figure cards appear under the landing tiles (0 → 1)... */
export const dockLanded = (u: number) => easeInOutCubic(phase(u, 0.74, 0.14))

/** ...and only then do the tiles fade away, so there is never a see-through moment (0 → 1). */
const dockGone = (u: number) => easeInOutCubic(phase(u, 0.88, 0.12))

type Box = { x: number; y: number; w: number; h: number }

/**
 * Copies of the live tiles that fly over the report from where they were to their card. Rendered
 * only while docking, inside `host` (a positioned element that holds both the tiles and the key
 * figures, so their relative positions don't change when the content above grows or scrolls).
 * Positions are written straight to the DOM from a layout effect: they depend on measurements.
 */
export function DockLayer({ u, host, tiles }: { u: number; host: RefObject<HTMLElement | null>; tiles: TileSpec[] }) {
  const layer = useRef<HTMLDivElement>(null)
  const origin = useRef<Partial<Record<DockId, Box>> | null>(null)
  useLayoutEffect(() => {
    const root = host.current
    const el = layer.current
    if (!root || !el) return
    const base = root.getBoundingClientRect()
    const boxOf = (node: Element | null): Box | null => {
      if (!node) return null
      const r = node.getBoundingClientRect()
      return {
        x: r.left - base.left,
        y: r.top - base.top,
        w: r.width,
        h: r.height,
      }
    }
    if (!origin.current) {
      origin.current = {}
      for (const id of dockIds) {
        const box = boxOf(root.querySelector(`[data-tile="${id}"]`))
        if (box) origin.current[id] = box
      }
    }
    const gone = dockGone(u)
    dockIds.forEach((id, k) => {
      const clone = el.querySelector<HTMLElement>(`[data-clone="${id}"]`)
      if (!clone) return
      const from = origin.current?.[id]
      const to = boxOf(root.querySelector(`[data-metric="${DOCK_TARGETS[id]}"]`))
      if (!from || !to) {
        clone.style.display = "none"
        return
      }
      const p = flight(u, k)
      const lift = Math.sin(Math.PI * p)
      const ring = `color-mix(in oklch, var(--border) ${Math.round(Math.min(1, p * 5) * 100)}%, transparent)`
      const { style } = clone
      style.display = ""
      style.left = `${lerp(from.x, to.x, p)}px`
      style.top = `${lerp(from.y, to.y, p)}px`
      style.width = `${lerp(from.w, to.w, p)}px`
      style.height = `${lerp(from.h, to.h, p)}px`
      style.borderRadius = `${Math.min(1, p * 5) * 12}px`
      style.opacity = `${1 - gone}`
      style.boxShadow = `inset 0 0 0 1px ${ring}, 0 14px 34px -10px color-mix(in oklch, var(--foreground) ${Math.round(lift * 22)}%, transparent)`
    })
  })
  return (
    <div ref={layer} aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {tiles
        .filter((tile): tile is TileSpec & { id: DockId } => tile.id in DOCK_TARGETS)
        .map((tile) => (
          <dl key={tile.id} data-clone={tile.id} className="absolute overflow-hidden bg-card" style={{ display: "none" }}>
            <Tile {...tile} id={undefined} />
          </dl>
        ))}
    </div>
  )
}
