"use client"

import { useRef } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { cubicPoint, phase, wireControls, wirePath, type Point } from "@/lib/chart-geometry"
import { ArtFrame, Chip } from "./parts"
import { useLoop } from "./use-loop"

// Wires between conditions and a buy: with AND all of them are needed, with OR one is enough.

const W = 640
const H = 270
const CYCLE = 12.5
const REST = 4.2

const A_OUT: Point = { x: 214, y: 66 }
const B_OUT: Point = { x: 214, y: 176 }
const JOIN: Point = { x: 330, y: 121 }
const JOIN_L: Point = { x: JOIN.x - 28, y: JOIN.y }
const JOIN_R: Point = { x: JOIN.x + 28, y: JOIN.y }
const BUY_IN: Point = { x: 446, y: 121 }

const inside = (t: number, from: number, to: number) => t >= from && t < to

/** Where along a wire the travelling dot is (0 -> 1, looping), or null when the wire is off. */
function dotAt(from: Point, to: Point, lit: boolean, time: number) {
  if (!lit) return null
  const [p0, p1, p2, p3] = wireControls(from, to, "h")
  return cubicPoint(p0, p1, p2, p3, (time * 0.7) % 1)
}

function WiresArt() {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const time = useLoop(ref, CYCLE, REST)

  const and = time < 6.25
  const litA = inside(time, 1, 5.5) || inside(time, 7.2, 11.7)
  const litB = inside(time, 3, 5.5) || inside(time, 9.2, 11.7)
  const fire = and ? litA && litB : litA || litB

  const message = and
    ? litA && litB
      ? t("Se cumplen las dos: se compra.", "Both hold: it buys.")
      : litA
        ? t("Solo se cumple una: con Y todavía no se compra.", "Only one holds: with AND it does not buy yet.")
        : t("Con Y hacen falta todas las condiciones.", "With AND, every condition is needed.")
    : fire
      ? t("Se cumple una: con O basta para comprar.", "One holds: with OR that is enough to buy.")
      : t("Con O basta con que se cumpla una.", "With OR, one condition is enough.")

  const wire = (from: Point, to: Point, lit: boolean) => (
    <path
      d={wirePath(from, to, "h")}
      fill="none"
      stroke={lit ? "var(--primary)" : "var(--border-strong)"}
      strokeWidth={lit ? 2.5 : 1.8}
      style={{ transition: "stroke 250ms ease" }}
    />
  )
  const dotA = dotAt(A_OUT, JOIN_L, litA, time)
  const dotB = dotAt(B_OUT, JOIN_L, litB, time)
  const dotC = dotAt(JOIN_R, BUY_IN, fire, time)
  const dot = (p: Point | null, key: string) =>
    p && <circle key={key} cx={p.x} cy={p.y} r={4.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />

  const node = (yTop: number, label: string, lit: boolean) => (
    <g>
      <rect
        x={26}
        y={yTop}
        width={188}
        height={52}
        rx={14}
        fill="var(--card)"
        stroke={lit ? "var(--primary)" : "var(--border-strong)"}
        strokeWidth={lit ? 2.5 : 1.5}
        style={{ transition: "stroke 250ms ease" }}
      />
      <circle cx={46} cy={yTop + 26} r={6} fill={lit ? "var(--up)" : "var(--border-strong)"} style={{ transition: "fill 250ms ease" }} />
      <text x={62} y={yTop + 31} fontSize={14} fontWeight={600} fill="var(--foreground)">
        {label}
      </text>
    </g>
  )

  return (
    <ArtFrame
      ref={ref}
      caption={t(
        "Ejemplo ilustrativo. Un punto verde significa que la condición se cumple en ese momento. Primero el interruptor está en Y, después pasa a O.",
        "Illustrative example. A green dot means the condition holds at that moment. First the switch is on AND, then it moves to OR."
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={t(
          "Dos condiciones conectadas por cables a un nodo de compra. Con Y se necesitan las dos; con O basta una.",
          "Two conditions wired to a buy node. With AND both are needed; with OR one is enough."
        )}
      >
        {wire(A_OUT, JOIN_L, litA)}
        {wire(B_OUT, JOIN_L, litB)}
        {wire(JOIN_R, BUY_IN, fire)}
        {node(40, "RSI(14) < 30", litA)}
        {node(150, t("Volumen alto", "High volume"), litB)}
        {dot(dotA, "a")}
        {dot(dotB, "b")}
        {dot(dotC, "c")}

        <g>
          <rect
            x={JOIN.x - 28}
            y={JOIN.y - 17}
            width={56}
            height={34}
            rx={17}
            fill="var(--card)"
            stroke={fire ? "var(--up)" : "var(--primary)"}
            strokeWidth={2}
            style={{ transition: "stroke 250ms ease" }}
          />
          <rect x={JOIN.x - 24} y={JOIN.y - 13} width={24} height={26} rx={13} fill="var(--primary)" opacity={and ? 1 : 0.15} style={{ transition: "opacity 250ms ease" }} />
          <rect x={JOIN.x} y={JOIN.y - 13} width={24} height={26} rx={13} fill="var(--primary)" opacity={and ? 0.15 : 1} style={{ transition: "opacity 250ms ease" }} />
          <text x={JOIN.x - 12} y={JOIN.y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={and ? "var(--primary-foreground)" : "var(--foreground)"}>
            {t("Y", "AND")}
          </text>
          <text x={JOIN.x + 12} y={JOIN.y + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={and ? "var(--foreground)" : "var(--primary-foreground)"}>
            {t("O", "OR")}
          </text>
        </g>

        <g>
          <rect
            x={BUY_IN.x}
            y={JOIN.y - 32}
            width={166}
            height={64}
            rx={14}
            fill={fire ? "var(--up)" : "var(--card)"}
            fillOpacity={fire ? 0.16 : 1}
            stroke={fire ? "var(--up)" : "var(--border-strong)"}
            strokeWidth={fire ? 2.5 : 1.5}
            style={{ transition: "all 250ms ease" }}
          />
          <text x={BUY_IN.x + 83} y={JOIN.y - 2} textAnchor="middle" fontSize={15} fontWeight={700} fill={fire ? "var(--up)" : "var(--muted-foreground)"}>
            {t("COMPRAR", "BUY")}
          </text>
          <text x={BUY_IN.x + 83} y={JOIN.y + 17} textAnchor="middle" fontSize={11.5} fill="var(--muted-foreground)">
            {fire ? t("¡orden de compra!", "buy order!") : t("sin señal", "no signal")}
          </text>
        </g>

        <Chip x={W / 2} y={H - 26} text={message} color={fire ? "var(--up)" : "var(--muted-foreground)"} alpha={phase(time, 0, 0.3)} size={13} />
      </svg>
    </ArtFrame>
  )
}

export { WiresArt }
