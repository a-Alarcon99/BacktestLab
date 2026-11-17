"use client"

import { useRef } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { num } from "@/components/landing/format"
import { easeOutCubic, linear, phase } from "@/lib/chart-geometry"
import { ArtFrame, Chip } from "./parts"
import { useLoop } from "./use-loop"

// Parameter sensitivity: the same strategy with five values of one parameter. A sturdy strategy
// gives similar results on all of them; a fragile one only works at one value.

const W = 640
const H = 280
const CYCLE = 13
const REST = 4.5
const VALUES = [24, 27, 30, 33, 36]
const CASES = [
  { returns: [8, 11, 12, 10, 9], start: 0.2 },
  { returns: [-6, -4, 22, -5, -8], start: 6.7 },
]
const SPLIT = 6.5

const xAt = (i: number) => 96 + i * 112
const y = linear(-10, 25, 224, 48)
const BAR = 56

function SensitivityArt() {
  const { locale, t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const time = useLoop(ref, CYCLE, REST)
  const sturdy = time < SPLIT
  const current = CASES[sturdy ? 0 : 1]
  const local = time - current.start
  const verdict = phase(time, sturdy ? 3.4 : 9.9, 0.5)
  const fade = sturdy ? 1 - phase(time, SPLIT - 0.4, 0.4) : 1 - phase(time, CYCLE - 0.5, 0.5)

  return (
    <ArtFrame
      ref={ref}
      caption={t(
        "Ejemplo ilustrativo. Cada barra es el resultado de la misma estrategia cambiando solo el nivel de RSI de compra. La barra central es el valor original.",
        "Illustrative example. Each bar is the result of the same strategy changing only the buy RSI level. The middle bar is the original value."
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={t(
          "Dos gráficos de barras: una estrategia estable, con resultados parecidos en los cinco valores, y una frágil, que solo funciona en uno.",
          "Two bar charts: a sturdy strategy, with similar results on all five values, and a fragile one that only works on one."
        )}
      >
        <g opacity={fade}>
          <line x1={48} x2={W - 24} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
          <text x={48} y={y(0) - 6} fontSize={10.5} fill="var(--muted-foreground)">
            0 %
          </text>
          <text x={W / 2} y={24} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--foreground)">
            {sturdy ? t("Estrategia estable", "Sturdy strategy") : t("Estrategia frágil", "Fragile strategy")}
          </text>

          {current.returns.map((r, i) => {
            const grow = easeOutCubic(phase(local, 0.3 + i * 0.25, 0.9))
            const top = y(r * grow)
            const win = r >= 0
            return (
              <g key={i}>
                <rect
                  x={xAt(i) - BAR / 2}
                  y={Math.min(top, y(0))}
                  width={BAR}
                  height={Math.max(Math.abs(top - y(0)), 1)}
                  rx={5}
                  fill={win ? "var(--up)" : "var(--down)"}
                  opacity={i === 2 ? 1 : 0.55}
                  stroke={i === 2 ? "var(--primary)" : "none"}
                  strokeWidth={2.5}
                />
                <text x={xAt(i)} y={(win ? top : top + 14) + (win ? -7 : 0)} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--foreground)" opacity={grow}>
                  {`${r > 0 ? "+" : ""}${num(locale, r)} %`}
                </text>
                <text x={xAt(i)} y={252} textAnchor="middle" fontSize={12} fontWeight={i === 2 ? 700 : 400} fill="var(--muted-foreground)">
                  {`RSI < ${VALUES[i]}`}
                </text>
              </g>
            )
          })}

          <Chip
            x={W - 24}
            y={24}
            anchor="end"
            size={12}
            filled
            color={sturdy ? "var(--up)" : "var(--down)"}
            text={sturdy ? t("Resultado estable: más fiable", "Stable result: more reliable") : t("Un solo valor funciona: ¿casualidad?", "Only one value works: luck?")}
            alpha={verdict}
          />
        </g>
      </svg>
    </ArtFrame>
  )
}

export { SensitivityArt }
