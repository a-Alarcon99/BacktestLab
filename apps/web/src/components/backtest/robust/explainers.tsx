"use client"

import { useRef } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { clamp, easeOutBack, easeOutCubic, linePath, phase } from "@/lib/chart-geometry"
import { useClock, useShouldPlay } from "@/lib/motion"
import type { RobustTest } from "@/lib/robustness-report"
import { glow, paint, trianglePath, useSvgId, VizDefs } from "./viz"

// "How does it work?" for each robustness test: a looping drawing and three short steps, shown at
// the top of its form. Time-driven, but only while on screen, and still (final frame) with reduced motion.

export const CYCLE = 7.5
const W = 600
const H = 150

/** A wavy price line shared by the drawings. */
const price = (x: number) => 78 + 22 * Math.sin(x / 55) + 10 * Math.sin(x / 17) - x * 0.035

export function Steps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step, k) => (
        <li key={step.title} className="flex gap-3">
          <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{k + 1}</span>
          <p className="text-caption text-muted-foreground">
            <strong className="block text-foreground">{step.title}</strong>
            {step.text}
          </p>
        </li>
      ))}
    </ol>
  )
}

function Frame({ test, drawing, steps }: { test: RobustTest; drawing: React.ReactNode; steps: { title: string; text: string }[] }) {
  const { t } = useI18n()
  return (
    <section aria-label={t("Cómo funciona", "How it works")} data-test={test} className="grid gap-4 rounded-xl border bg-muted/30 p-3 sm:p-4 lg:col-span-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0 overflow-hidden rounded-lg border bg-card">{drawing}</div>
      <div className="flex flex-col gap-3">
        <h3 className="font-bold">{t("Cómo funciona", "How it works")}</h3>
        <Steps steps={steps} />
      </div>
    </section>
  )
}

/** Animation clock: seconds into the loop, or the end of it with reduced motion. */
export function useLoop() {
  const ref = useRef<HTMLDivElement>(null)
  const { play, reduced } = useShouldPlay(ref)
  const { time } = useClock(play)
  return { ref, s: reduced ? CYCLE - 0.01 : time % CYCLE }
}

/** Rolling windows: the range is cut into stretches and each one starts from zero. */
function WindowsDrawing({ length, step, count }: { length: number; step: number; count: number }) {
  const { t } = useI18n()
  const id = useSvgId()
  const { ref, s } = useLoop()
  const shown = Math.max(2, Math.min(5, count || 4))
  // Window geometry on a 0..1 timeline: the real proportions of length and step when they fit, else a tidy default.
  const total = Math.max(1, (shown - 1) * step + length)
  const wFrac = clamp(length / total, 0.2, 0.7)
  const stepFrac = shown > 1 ? (1 - wFrac) / (shown - 1) : 0
  const X0 = 24
  const X1 = W - 24
  const x = (f: number) => X0 + f * (X1 - X0)
  const top = 14
  const priceBottom = 82
  const pts = Array.from({ length: 80 }, (_, k) => ({ x: X0 + (k / 79) * (X1 - X0), y: price(k * 7.2) * 0.55 + 14 }))
  const dur = (CYCLE - 1) / shown
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("Dibujo de ventanas deslizándose sobre el precio", "Drawing of windows sliding over the price")}>
        <VizDefs id={id} />
        <path d={`${linePath(pts)}L${X1} ${priceBottom}L${X0} ${priceBottom}Z`} fill={paint(id, "ink")} />
        <path d={linePath(pts)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} opacity={0.6} />
        {Array.from({ length: shown }, (_, k) => {
          const start = 0.35 + k * dur
          const p = phase(s, start, dur * 0.9)
          const x1 = x(k * stepFrac)
          const x2 = x(k * stepFrac + wFrac)
          const y = 92 + k * 10
          const grow = easeOutBack(phase(s, start + dur * 0.8, 0.5))
          const win = k % 3 !== 2
          return (
            <g key={k}>
              {p > 0 && p < 1 && <rect x={x1} y={top} width={x2 - x1} height={priceBottom - top + 4} rx={5} fill="var(--primary)" opacity={0.1} stroke="var(--primary)" strokeDasharray="4 3" />}
              <rect x={x1} y={y} width={x2 - x1} height={7} rx={3.5} fill="var(--muted)" />
              <rect x={x1} y={y} width={(x2 - x1) * p} height={7} rx={3.5} fill={p >= 1 ? (win ? "var(--up)" : "var(--down)") : "var(--primary)"} />
              {p > 0 && p < 1 && (
                <>
                  <circle cx={x1} cy={priceBottom + 8} r={4} fill="var(--primary)" opacity={0.9} />
                  <text x={x1 + 8} y={priceBottom + 11} fontSize={9} fill="var(--primary)" fontWeight={700}>
                    {t("empieza de cero", "starts from zero")}
                  </text>
                </>
              )}
              {grow > 0 && (
                <g>
                  {p >= 1 && <path d={trianglePath(x2 - 8, y + 3.5, 4 * grow, win)} fill={win ? "var(--up)" : "var(--down)"} />}
                </g>
              )}
            </g>
          )
        })}
        <text x={X0} y={H - 6} fontSize={10} fill="var(--muted-foreground)">
          {t("Tu rango de fechas", "Your date range")} →
        </text>
        <text x={X1} y={H - 6} fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
          {t(`${shown} de ${count || shown} ventanas`, `${shown} of ${count || shown} windows`)}
        </text>
      </svg>
    </div>
  )
}

/** Parameter sensitivity: a grid of versions of the strategy, painted from the original outwards. */
function SensitivityDrawing() {
  const { t } = useI18n()
  const id = useSvgId()
  const { ref, s } = useLoop()
  const N = 5
  const cell = 46
  const X0 = (W - N * cell) / 2
  const Y0 = 14
  const progress = easeOutCubic(phase(s, 0.4, CYCLE - 2))
  // A smooth hill of results centred on the original, plus a little noise.
  const value = (r: number, c: number) => 1 - Math.hypot(r - 2, c - 2) / 3.2 + 0.12 * Math.sin(r * 2.1 + c * 1.3)
  const maxD = Math.hypot(2, 2)
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H + 64}`} className="w-full" role="img" aria-label={t("Dibujo de una cuadrícula de variantes", "Drawing of a grid of variants")}>
        <VizDefs id={id} />
        {Array.from({ length: N * N }, (_, k) => {
          const r = Math.floor(k / N)
          const c = k % N
          const d = Math.hypot(r - 2, c - 2) / maxD
          const a = clamp(progress * 1.25 - d * 0.9)
          const v = value(r, c)
          const base = r === 2 && c === 2
          return (
            <g key={k} opacity={a}>
              <rect
                x={X0 + c * cell + 2}
                y={Y0 + r * cell + 2}
                width={cell - 4}
                height={cell - 4}
                rx={8}
                fill={`color-mix(in oklab, var(${v >= 0.25 ? "--up" : "--down"}) ${Math.round(18 + clamp(Math.abs(v - 0.25)) * 70)}%, transparent)`}
                stroke={base ? "var(--primary)" : "var(--border)"}
                strokeWidth={base ? 2.4 : 1}
                filter={base ? glow(id) : undefined}
              />
              {base && (
                <text x={X0 + c * cell + cell / 2} y={Y0 + r * cell + cell / 2 + 3.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="var(--primary)">
                  {t("TUYA", "YOURS")}
                </text>
              )}
            </g>
          )
        })}
        <text x={X0 + (N * cell) / 2} y={Y0 + N * cell + 20} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {t("−20 %  ←  valor de un parámetro  →  +20 %", "−20 %  ←  value of a parameter  →  +20 %")}
        </text>
        <text x={X0 + (N * cell) / 2} y={Y0 + N * cell + 36} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
          {t("Zona verde amplia = robusta · un solo punto verde = sobreajuste", "Wide green area = robust · a single green spot = overfit")}
        </text>
      </svg>
    </div>
  )
}

/** Timeframes: the same range run on several timeframes at once. */
function TimeframesDrawing({ frames }: { frames: string[] }) {
  const { t } = useI18n()
  const id = useSvgId()
  const { ref, s } = useLoop()
  const shown = frames.length > 0 ? frames.slice(0, 5) : ["1h", "4h", "1d"]
  const u = easeOutCubic(phase(s, 0.4, CYCLE - 1.8))
  const X0 = 34
  const X1 = W - 54
  const colours = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("Dibujo de la misma estrategia en varias temporalidades", "Drawing of the same strategy on several timeframes")}>
        <VizDefs id={id} />
        <line x1={X0} x2={X1} y1={92} y2={92} stroke="var(--border-strong)" strokeDasharray="3 4" />
        {shown.map((tf, k) => {
          const points = Array.from({ length: 60 }, (_, i) => {
            const f = i / 59
            return { x: X0 + f * (X1 - X0), y: 92 - (f * (34 + k * 4) + 9 * Math.sin(f * (6 + k * 2.2) + k) * (0.4 + f)) }
          })
          const upTo = points.slice(0, Math.max(2, Math.round(u * 59)))
          const head = upTo.at(-1)!
          return (
            <g key={tf}>
              <path d={linePath(upTo)} fill="none" stroke={colours[k % colours.length]} strokeWidth={k === 0 ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" filter={k === 0 ? glow(id) : undefined} />
              <circle cx={head.x} cy={head.y} r={4} fill={colours[k % colours.length]} stroke="var(--card)" strokeWidth={2} />
              <text x={head.x + 8} y={head.y + 3.5} fontSize={10} fontWeight={700} fill={colours[k % colours.length]} className="num">
                {tf}
              </text>
            </g>
          )
        })}
        <text x={X0} y={H - 8} fontSize={10} fill="var(--muted-foreground)">
          {t("Mismas fechas, mismo activo, distinta temporalidad", "Same dates, same asset, different timeframe")}
        </text>
      </svg>
    </div>
  )
}

/** The "how it works" block of a test's form. */
export function TestExplainer({ test, length, step, windows, frames }: { test: RobustTest; length?: number; step?: number; windows?: number; frames?: string[] }) {
  const { t } = useI18n()
  if (test === "windows")
    return (
      <Frame
        test={test}
        drawing={<WindowsDrawing length={length ?? 90} step={step ?? 45} count={windows ?? 4} />}
        steps={[
          {
            title: t("Cortamos tu rango en ventanas", "We cut your range into windows"),
            text: t(
              `Cada ventana dura ${length ?? "L"} días y empieza ${step ?? "S"} días después de la anterior${windows ? `: salen ${windows}` : ""}.`,
              `Each window lasts ${length ?? "L"} days and starts ${step ?? "S"} days after the previous one${windows ? `: that makes ${windows}` : ""}.`
            ),
          },
          {
            title: t("En cada una la estrategia empieza de cero", "In each one the strategy starts from scratch"),
            text: t(
              "Mismo capital inicial y ninguna posición abierta, como si empezaras justo ese día. Es un backtest independiente por ventana.",
              "Same starting capital and no open position, as if you had started on that very day. It is an independent backtest per window."
            ),
          },
          {
            title: t("Miramos si gana casi siempre", "We check whether it wins almost every time"),
            text: t(
              "Si gana en la mayoría de ventanas, su ventaja no depende de cuándo empieces. Si solo gana en una, el resultado dependió de ese periodo concreto.",
              "If it wins in most windows, its edge doesn't depend on when you start. If it only wins in one, the result depended on that particular period."
            ),
          },
        ]}
      />
    )
  if (test === "sensitivity")
    return (
      <Frame
        test={test}
        drawing={<SensitivityDrawing />}
        steps={[
          {
            title: t("Elegimos uno o dos parámetros", "We pick one or two parameters"),
            text: t("Por ejemplo, el periodo del RSI o su umbral de compra.", "For example, the RSI period or its buy threshold."),
          },
          {
            title: t("Los movemos entre −20 % y +20 %", "We move them between −20 % and +20 %"),
            text: t("Se prueban 5 valores por parámetro (25 combinaciones con dos), cada una con un backtest completo.", "Five values per parameter are tried (25 combinations with two), each with a full backtest."),
          },
          {
            title: t("Buscamos una meseta, no un pico", "We look for a plateau, not a peak"),
            text: t("Si los valores vecinos rinden parecido, la estrategia es robusta. Si solo el tuyo gana, está ajustada al pasado.", "If neighbouring values do about as well, the strategy is robust. If only yours wins, it is fitted to the past."),
          },
        ]}
      />
    )
  return (
    <Frame
      test={test}
      drawing={<TimeframesDrawing frames={frames ?? []} />}
      steps={[
        {
          title: t("Elegimos temporalidades", "We pick timeframes"),
          text: t("La tuya y las que marques abajo: por ejemplo, 1 h, 4 h y 1 d.", "Yours and the ones you tick below: for example 1h, 4h and 1d."),
        },
        {
          title: t("Mismo activo, mismas fechas", "Same asset, same dates"),
          text: t("Cada temporalidad es un backtest completo con la misma estrategia y el mismo capital.", "Each timeframe is a full backtest with the same strategy and the same capital."),
        },
        {
          title: t("Comparamos los resultados", "We compare the results"),
          text: t("Si todas ganan, la estrategia no depende de una temporalidad concreta. Si solo una gana, puede ser casualidad.", "If they all win, the strategy doesn't depend on one timeframe. If only one wins, it may be luck."),
        },
      ]}
    />
  )
}
