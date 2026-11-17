"use client"

import { useRef } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { num } from "@/components/landing/format"
import { bandPath, easeOutCubic, linePath, linear, phase, type Point } from "@/lib/chart-geometry"
import { ArtFrame, Chip } from "./parts"
import { useLoop } from "./use-loop"

// Monte Carlo: many possible futures drawn at random; the shaded band holds most of them.

const W = 640
const H = 300
const CYCLE = 10.5
const REST = 7.5
const LEFT = 40
const RIGHT = 616
const STEPS = 40
const PATHS = 36

/** Small deterministic generator, so the picture is the same on the server and in the browser. */
function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const rnd = random(7)
const curves: number[][] = Array.from({ length: PATHS }, () => {
  let value = 100
  return [100, ...Array.from({ length: STEPS }, () => (value *= 1 + 0.004 + (rnd() - 0.5) * 0.07))]
})
const percentile = (sorted: number[], q: number) => sorted[Math.round(q * (sorted.length - 1))]
const bands = Array.from({ length: STEPS + 1 }, (_, i) => {
  const column = curves.map((c) => c[i]).sort((a, b) => a - b)
  return { p5: percentile(column, 0.05), p25: percentile(column, 0.25), p50: percentile(column, 0.5), p75: percentile(column, 0.75), p95: percentile(column, 0.95) }
})
const [LOW, HIGH] = [Math.min(...curves.flat()), Math.max(...curves.flat())]
const xAt = (i: number) => LEFT + (i / STEPS) * (RIGHT - LEFT)
const y = linear(LOW - 3, HIGH + 3, 270, 36)
const trace = (values: number[]): Point[] => values.map((v, i) => ({ x: xAt(i), y: y(v) }))
const line = (key: keyof (typeof bands)[number]) => trace(bands.map((b) => b[key]))

function MonteCarloArt() {
  const { locale, t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const time = useLoop(ref, CYCLE, REST)
  const p = easeOutCubic(phase(time, 0.3, 4))
  const band = phase(time, 4.6, 1)
  const label = phase(time, 5.8, 0.6)
  const fade = 1 - phase(time, 9.9, 0.5)
  const last = bands[STEPS]

  return (
    <ArtFrame
      ref={ref}
      caption={t(
        "Ejemplo ilustrativo con datos inventados. Cada línea fina es un futuro posible; la línea gruesa es el que ocurrió de verdad. La franja azul agrupa la gran mayoría de los futuros simulados.",
        "Illustrative example with made-up data. Each thin line is one possible future; the thick line is the one that actually happened. The blue band holds the vast majority of the simulated futures."
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={t(
          "Decenas de trayectorias simuladas del capital que se abren en abanico, con una franja que agrupa el 90 % de ellas.",
          "Dozens of simulated equity paths fanning out, with a band holding 90% of them."
        )}
      >
        <defs>
          <clipPath id="docs-mc-clip">
            <rect x={0} y={0} width={LEFT + p * (RIGHT - LEFT)} height={H} />
          </clipPath>
        </defs>
        <g opacity={fade}>
          <line x1={LEFT} x2={RIGHT} y1={y(100)} y2={y(100)} stroke="var(--muted-foreground)" strokeOpacity={0.45} strokeDasharray="2 4" />
          <g clipPath="url(#docs-mc-clip)">
            <path d={bandPath(line("p95"), line("p5"))} fill="var(--primary)" opacity={0.12 * band} />
            <path d={bandPath(line("p75"), line("p25"))} fill="var(--primary)" opacity={0.2 * band} />
            {curves.slice(1).map((c, i) => (
              <path key={i} d={linePath(trace(c))} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.3} strokeWidth={1.2} strokeLinejoin="round" />
            ))}
            <path d={linePath(line("p50"))} fill="none" stroke="var(--primary)" strokeWidth={1.6} strokeDasharray="5 4" opacity={band} />
            <path d={linePath(trace(curves[0]))} fill="none" stroke="var(--foreground)" strokeWidth={2.8} strokeLinejoin="round" />
          </g>
          <Chip
            x={LEFT + 6}
            y={16}
            anchor="start"
            size={11.5}
            color="var(--primary)"
            text={t(
              `9 de cada 10 futuros acaban entre ${num(locale, last.p5 - 100)} % y +${num(locale, last.p95 - 100)} %`,
              `9 out of 10 futures end between ${num(locale, last.p5 - 100)}% and +${num(locale, last.p95 - 100)}%`
            )}
            alpha={label}
          />
        </g>
      </svg>
    </ArtFrame>
  )
}

export { MonteCarloArt }
