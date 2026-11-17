"use client"

import { useRef } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { num } from "@/components/landing/format"
import type { Locale } from "@/lib/i18n"
import { easeOutCubic, linePath, linear, phase } from "@/lib/chart-geometry"
import { ArtFrame, Chip, drawdownOf } from "./parts"
import { useLoop } from "./use-loop"

// Equity curve of a strategy against buy & hold, with the drawdown underneath.

const W = 640
const H = 320
const CYCLE = 11
const REST = 8
const LEFT = 44
const RIGHT = 616

const HOLD = [100, 104, 110, 107, 112, 120, 114, 104, 96, 90, 94, 101, 108, 104, 112, 118, 124, 119, 126, 130]
const STRATEGY = [100, 100, 103, 106, 109, 113, 113, 113, 113, 113, 113, 113, 116, 116, 121, 124, 127, 127, 131, 135]
const BUYS = [1, 12]
const SELLS = [6, 18]
const N = HOLD.length

const xAt = (i: number) => LEFT + (i / (N - 1)) * (RIGHT - LEFT)
const yEq = linear(84, 140, 190, 40)
const yDd = linear(0, -30, 232, 296)
const DD_HOLD = drawdownOf(HOLD)
const DD_STRATEGY = drawdownOf(STRATEGY)
const pointsOf = (values: number[], y: (v: number) => number) => values.map((v, i) => ({ x: xAt(i), y: y(v) }))

function EquityArt() {
  const { locale, t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const time = useLoop(ref, CYCLE, REST)
  const p = easeOutCubic(phase(time, 0.4, 5.2))
  const reveal = (i: number) => p * (N - 1) >= i
  const end = phase(time, 5.8, 0.6)
  const fade = 1 - phase(time, 10.4, 0.5)

  const holdReturn = HOLD[N - 1] - 100
  const strategyReturn = STRATEGY[N - 1] - 100
  const worstHold = Math.min(...DD_HOLD)
  const worstStrategy = Math.min(...DD_STRATEGY)
  const clipW = LEFT + p * (RIGHT - LEFT)

  return (
    <ArtFrame
      ref={ref}
      caption={t(
        "Ejemplo ilustrativo. La estrategia vende antes de la caída y vuelve a entrar después. Abajo se ve cuánto cayó cada línea desde su último máximo (drawdown).",
        "Illustrative example. The strategy sells before the fall and gets back in afterwards. Below, how far each line fell from its last peak (drawdown)."
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={t(
          `Curva de capital de una estrategia (${num(locale, strategyReturn)} %) frente a comprar y mantener (${num(locale, holdReturn)} %), con su caída máxima (${num(locale, worstStrategy)} % frente a ${num(locale, worstHold)} %).`,
          `Equity curve of a strategy (${num(locale, strategyReturn)}%) against buy & hold (${num(locale, holdReturn)}%), with its maximum drawdown (${num(locale, worstStrategy)}% against ${num(locale, worstHold)}%).`
        )}
      >
        <defs>
          <clipPath id="docs-equity-clip">
            <rect x={0} y={0} width={clipW} height={H} />
          </clipPath>
        </defs>
        <g opacity={fade}>
          <line x1={LEFT} x2={RIGHT} y1={yEq(100)} y2={yEq(100)} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="2 4" />
          <text x={RIGHT} y={yEq(100) + 14} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
            {t("capital inicial", "starting capital")}
          </text>
          <text x={LEFT} y={218} fontSize={11} fontWeight={600} fill="var(--muted-foreground)">
            {t("Caída desde el máximo", "Fall from the peak")}
          </text>
          <line x1={LEFT} x2={RIGHT} y1={yDd(0)} y2={yDd(0)} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="2 4" />

          <g clipPath="url(#docs-equity-clip)">
            <path d={linePath(pointsOf(HOLD, yEq))} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />
            <path d={linePath(pointsOf(STRATEGY, yEq))} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" />
            <path d={`${linePath(pointsOf(DD_HOLD, yDd))}L${xAt(N - 1)} ${yDd(0)}L${xAt(0)} ${yDd(0)}Z`} fill="var(--down)" opacity={0.18} />
            <path d={linePath(pointsOf(DD_HOLD, yDd))} fill="none" stroke="var(--down)" strokeWidth={1.8} strokeLinejoin="round" />
            <path d={linePath(pointsOf(DD_STRATEGY, yDd))} fill="none" stroke="var(--primary)" strokeWidth={2.2} strokeLinejoin="round" />
          </g>

          {BUYS.filter(reveal).map((i) => (
            <polygon key={`b${i}`} points={`${xAt(i)},${yEq(STRATEGY[i]) + 7} ${xAt(i) - 7},${yEq(STRATEGY[i]) + 20} ${xAt(i) + 7},${yEq(STRATEGY[i]) + 20}`} fill="var(--up)" />
          ))}
          {SELLS.filter(reveal).map((i) => (
            <polygon key={`s${i}`} points={`${xAt(i)},${yEq(STRATEGY[i]) - 7} ${xAt(i) - 7},${yEq(STRATEGY[i]) - 20} ${xAt(i) + 7},${yEq(STRATEGY[i]) - 20}`} fill="var(--down)" />
          ))}

          <Chip x={LEFT + 4} y={16} anchor="start" size={11.5} color="var(--primary)" text={`${t("Tu estrategia", "Your strategy")} ${signed(locale, strategyReturn)} %`} alpha={end} />
          <Chip x={LEFT + 214} y={16} anchor="start" size={11.5} color="var(--muted-foreground)" text={`${t("Comprar y mantener", "Buy & hold")} ${signed(locale, holdReturn)} %`} alpha={end} />
          <Chip x={xAt(9) + 10} y={yDd(worstHold) - 14} anchor="start" size={11.5} color="var(--down)" text={`${num(locale, worstHold)} %`} alpha={end} />
          <Chip x={xAt(13)} y={yDd(0) + 16} size={11.5} color="var(--primary)" text={`${num(locale, worstStrategy)} %`} alpha={end} />
        </g>
      </svg>
    </ArtFrame>
  )
}

function signed(locale: Locale, value: number) {
  return `${value > 0 ? "+" : ""}${num(locale, value)}`
}

export { EquityArt }
