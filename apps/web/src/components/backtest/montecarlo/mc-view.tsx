"use client"

import { useMemo, type CSSProperties } from "react"
import { DicesIcon, ShuffleIcon } from "lucide-react"
import { cn } from "cn"
import { bandPath, clamp, easeInOutCubic, easeOutBack, easeOutCubic, extent, linePath, linear, niceTicks, pad, phase } from "@/lib/chart-geometry"
import {
  bandsAtRuns,
  histogramAt,
  histogramDomain,
  mcReport,
  mcStats,
  rankOf,
  RUIN_DRAWDOWN_PCT,
  type Histogram,
  type McCriterion,
  type McReport,
  type McSummary,
} from "@/lib/monte-carlo"
import { curveUpTo, tableCsv } from "@/lib/robustness-report"
import { useReplayText } from "../replay/format"
import { STEPS, timeAt, timelineOf } from "../multi/multi-data"
import { Reveal, toneBg, toneSoft, toneText } from "../report/parts"
import { Seal } from "../report/verdict-panel"
import { downloadText } from "../robust/download"
import { ChartTip, Crosshair, Hint, HoverDot, indexAtX, TipRow, TipTitle, useChartHover } from "../robust/hover"
import { RobustFrame } from "../robust/robust-frame"
import { glow, LegendRow, Narration, paint, ReadingPanel, Ring, signVar, spreadOut, StatTile, Tag, trianglePath, useSvgId, VizDefs, VizPanel } from "../robust/viz"
import type { McRun } from "./mc-types"

const W = 1000
const FX0 = 56
const FX1 = 792
/** The distribution of how the histories end, beside the fan. */
const MX0 = 818
const MX1 = W - 8
const MARGIN_BINS = 30
const FAN_H = 340
const F_TOP = 30
const F_BOTTOM = FAN_H - 34
/** The real history is drawn first; then the simulated ones arrive; then everything settles. */
const REAL_END = Math.round(STEPS * 0.1)
const SIM_END = Math.round(STEPS * 0.84)
/** Simulations that fly into the distribution as a ball (one in every few, so a handful are in the air at once). */
const BALLS = 160
const BALL_FLIGHT = 14
/** Drawdown limits of the risk strip: below the first is moderate, past the second severe. */
const DD_HIGH = 30
const DD_SEVERE = RUIN_DRAWDOWN_PCT

const delay = (s: number) => ({ "--bt-delay": `${s}s` }) as CSSProperties
type T = <V>(es: V, en: V) => V
type F = ReturnType<typeof useReplayText>["f"]

/** Runs counted so far at a playback position (all of them once it is over). */
const runsAt = (pos: number, runs: number) => (pos >= STEPS ? runs : pos <= REAL_END ? 0 : Math.round(runs * easeInOutCubic(phase(pos, REAL_END, SIM_END - REAL_END))))

/** Position at which the run number `n` (1-based) is counted: the inverse of `runsAt`. */
function posOfRun(n: number, runs: number) {
  let lo = REAL_END
  let hi = SIM_END
  for (let k = 0; k < 22; k++) {
    const mid = (lo + hi) / 2
    if (runsAt(mid, runs) >= n) hi = mid
    else lo = mid
  }
  return hi
}

type Props = {
  run: McRun
  summary: McSummary
  onClose: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  extraActions?: React.ReactNode
}

/** Monte Carlo: the real history, then thousands of alternative ones, and what they say together. */
export function McView({ run, summary, onClose, expanded, onExpandedChange, extraActions }: Props) {
  const { locale, t, f } = useReplayText()
  const id = useSvgId()
  const timeline = useMemo(() => timelineOf(run.from, run.to), [run.from, run.to])
  const report = useMemo(() => mcReport(summary), [summary])
  const domain = useMemo(() => histogramDomain(summary), [summary])
  const shuffle = summary.method === "shuffle"
  const trades = summary.source === "trades"
  const points = summary.real.curve.length
  const { runs } = summary
  const fanHover = useChartHover(W, FAN_H)

  // Histogram of what the question is: the final return, or (mixing only the order) the drawdown.
  const metric = shuffle ? summary.drawdowns : summary.returns
  const hist = useMemo<Histogram>(() => {
    if (!shuffle) return domain
    const hi = Math.max(...summary.drawdowns, summary.real.maxDrawdownPct, 1)
    return { lo: 0, hi: hi * 1.08, bins: domain.bins }
  }, [shuffle, domain, summary])
  const realMetric = shuffle ? summary.real.maxDrawdownPct : summary.real.returnPct
  const finalCounts = useMemo(() => histogramAt(metric, hist), [metric, hist])
  const maxCount = Math.max(1, ...finalCounts)

  // --- Fan chart geometry
  const [lo, hi] = useMemo(() => pad(extent([100, ...summary.bands.p5, ...summary.bands.p95, ...summary.real.curve, ...summary.samples.flat()]), 0.05), [summary])
  const yFan = linear(lo, hi, F_BOTTOM, F_TOP)
  const xFan = (k: number) => FX0 + (k / Math.max(1, points - 1)) * (FX1 - FX0)
  const fanTicks = niceTicks(lo, hi, 5)
  const toPts = (curve: number[]) => curve.map((v, k) => ({ x: xFan(k), y: yFan(v) }))
  /** The first `u` (0-1) of a curve, its last point gliding between two samples. */
  const partial = (curve: number[], u: number) => {
    const pts = toPts(curveUpTo(curve, u))
    if (pts.length > 1 && u < 1) pts[pts.length - 1].x = xFan(u * (points - 1))
    return pts
  }
  const sampleCount = summary.samples.length

  // --- The distribution beside the fan: final values (100 = the starting capital) in the fan's own scale.
  const finals = useMemo(() => summary.returns.map((r) => 100 + r), [summary.returns])
  const marginDomain = useMemo<Histogram>(() => ({ lo, hi, bins: MARGIN_BINS }), [lo, hi])
  const marginFinal = useMemo(() => histogramAt(finals, marginDomain), [finals, marginDomain])
  const marginMax = Math.max(1, ...marginFinal)
  const marginStep = (hi - lo) / MARGIN_BINS
  const binOfValue = (v: number) => clamp(Math.floor((v - lo) / marginStep), 0, MARGIN_BINS - 1)
  const barLength = (count: number) => (count / marginMax) * (MX1 - MX0 - 6)
  // Balls: one simulation every `stride`, with the moment it is counted.
  const balls = useMemo(() => {
    const stride = Math.max(1, Math.ceil(runs / BALLS))
    const out: { at: number; value: number }[] = []
    for (let i = stride - 1; i < runs; i += stride) out.push({ at: posOfRun(i + 1, runs), value: finals[i] })
    return out
  }, [runs, finals])
  // How the estimate settles as simulations are added (the share that wins, or the bad-case drawdown).
  const convergence = useMemo(() => {
    const out: { n: number; v: number }[] = []
    const steps = Math.min(48, runs)
    for (let i = 1; i <= steps; i++) {
      const n = Math.max(2, Math.round((runs * i) / steps))
      const st = mcStats(summary, n)
      out.push({ n, v: shuffle ? st.drawdownPct.p95 : st.probProfit })
    }
    return out
  }, [summary, runs, shuffle])

  const label = t("Reproducción de Monte Carlo", "Monte Carlo replay")

  const xLabel = (u: number) => (trades ? t(`operación ${Math.round(u * summary.length)}`, `trade ${Math.round(u * summary.length)}`) : f.axisDate.format(new Date(timeAt(timeline, u * STEPS))))
  const xAxisLabel = (u: number) => (trades ? `${Math.round(u * summary.length)}` : f.axisDate.format(new Date(timeAt(timeline, u * STEPS))))

  const csv = () => {
    const headers = locale === "es" ? ["Simulación", "Retorno final %", "Caída máxima %"] : ["Simulation", "Final return %", "Max drawdown %"]
    const rows = summary.returns.map((r, i) => [i + 1, r, summary.drawdowns[i]])
    downloadText(`backtestlab-montecarlo-${run.symbol.toLowerCase()}-${run.timeframe}-${run.from}_${run.to}.csv`, tableCsv(headers, rows, locale))
  }

  const options = trades
    ? t(`${f.count.format(runs)} historias · ${shuffle ? "mezclando el orden" : "operaciones al azar"} · semilla ${summary.seed}`, `${f.count.format(runs)} histories · ${shuffle ? "shuffling the order" : "random trades"} · seed ${summary.seed}`)
    : t(`${f.count.format(runs)} mercados sintéticos · bloques de ${summary.blockLength} velas · semilla ${summary.seed}`, `${f.count.format(runs)} synthetic markets · blocks of ${summary.blockLength} candles · seed ${summary.seed}`)

  return (
    <RobustFrame
      run={{ kind: run.kind, symbol: run.symbol, timeframe: run.timeframe, from: run.from, to: run.to, strategy: run.strategy, mode: run.mode, options }}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      onClose={onClose}
      label={label}
      dateAt={(pos) => (trades ? t(`Operación ${Math.round((pos / STEPS) * summary.length)}`, `Trade ${Math.round((pos / STEPS) * summary.length)}`) : f.date.format(new Date(timeAt(timeline, pos))))}
      counterAt={(pos) => t(`${f.count.format(runsAt(pos, runs))} / ${f.count.format(runs)} simulaciones`, `${f.count.format(runsAt(pos, runs))} / ${f.count.format(runs)} simulations`)}
      onCsv={csv}
      extraActions={extraActions}
      animation={(pos, finished) => {
        const seen = runsAt(pos, runs)
        const realU = easeOutCubic(phase(pos, 0, REAL_END))
        const settle = easeOutCubic(phase(pos, SIM_END, STEPS - SIM_END))
        const bands = bandsAtRuns(summary, Math.max(2, seen))
        const bandIn = easeOutCubic(phase(seen, 1, 14)) * (seen >= 2 ? 1 : 0)
        const st = seen >= 2 ? mcStats(summary, seen) : null
        const realPts = partial(summary.real.curve, realU)
        const winShare = st ? (shuffle ? (summary.real.returnPct > 0 ? 100 : 0) : st.probProfit) : 0
        const head = realPts.at(-1)
        const realRet = (curveUpTo(summary.real.curve, realU).at(-1) ?? 100) - 100
        const margin = histogramAt(finals, marginDomain, seen)
        const running = !finished && pos < SIM_END && pos > REAL_END
        const final = summary.real.curve.at(-1) ?? 100

        // Reading under the pointer, once finished: the fan at a moment, or a bar of the distribution.
        const at = finished ? fanHover.at : null
        const fk = at && at.x <= FX1 + 6 && at.x >= FX0 - 6 ? indexAtX(at.x, FX0, FX1, points) : null
        const mb = at && at.x >= MX0 - 4 ? binOfValue(lo + ((F_BOTTOM - at.y) / (F_BOTTOM - F_TOP)) * (hi - lo)) : null

        let narration: React.ReactNode
        if (finished || pos >= SIM_END + 24) {
          const all = mcStats(summary)
          narration = shuffle
            ? t(
                `Resultado: con las mismas operaciones en ${f.count.format(runs)} órdenes distintos, la caída máxima habitual es ${f.pct(all.drawdownPct.p50, 0)} y en el 5 % de los casos más desfavorables llega a ${f.pct(all.drawdownPct.p95, 0)}.`,
                `Result: with the same trades in ${f.count.format(runs)} different orders, the usual maximum drawdown is ${f.pct(all.drawdownPct.p50, 0)} and in the least favourable 5 % of cases it reaches ${f.pct(all.drawdownPct.p95, 0)}.`
              )
            : t(
                `Resultado: en el ${f.pct(all.probProfit, 0)} de las ${f.count.format(runs)} historias la estrategia gana dinero. La línea gruesa es tu historia real; la zona coloreada contiene el 90 % de las demás. Pasa el ratón por los gráficos para leer cada punto.`,
                `Result: in ${f.pct(all.probProfit, 0)} of the ${f.count.format(runs)} histories the strategy makes money. The thick line is your real history; the coloured zone holds 90 % of the others. Hover over the charts to read each point.`
              )
        } else if (pos < REAL_END) {
          narration = trades
            ? t(`Esto es lo que ocurrió: una única historia con ${summary.length} operaciones cerradas.`, `This is what happened: a single history with ${summary.length} closed trades.`)
            : t(`Esto es lo que ocurrió en ${run.symbol.toUpperCase()}: una única historia del mercado y de tu estrategia.`, `This is what happened on ${run.symbol.toUpperCase()}: a single market history and your strategy.`)
        } else {
          narration = trades
            ? shuffle
              ? t(`Reordenando tus ${summary.length} operaciones: simulación ${f.count.format(seen)} de ${f.count.format(runs)}. Todas terminan en el mismo resultado, pero el camino y las caídas cambian.`, `Reordering your ${summary.length} trades: simulation ${f.count.format(seen)} of ${f.count.format(runs)}. They all end at the same result, but the path and the drawdowns change.`)
              : t(`Extrayendo operaciones al azar de las tuyas: simulación ${f.count.format(seen)} de ${f.count.format(runs)}. Cada línea es una historia posible con operaciones parecidas a las reales.`, `Drawing trades at random from yours: simulation ${f.count.format(seen)} of ${f.count.format(runs)}. Each line is a possible history with trades like the real ones.`)
            : t(`Construyendo mercados nuevos con tramos de ${summary.blockLength} velas reales: ${f.count.format(seen)} de ${f.count.format(runs)}. Cada resultado cae en la distribución de la derecha.`, `Building new markets from ${summary.blockLength}-candle stretches of real ones: ${f.count.format(seen)} of ${f.count.format(runs)}. Each result drops into the distribution on the right.`)
        }

        // Labels at the right edge of the fan, kept apart.
        const lastBand = (a: number[]) => a[a.length - 1]
        const tagYs = spreadOut([yFan(lastBand(bands.p95)), yFan(lastBand(bands.p50)), yFan(lastBand(bands.p5)), yFan(final)], 22, F_TOP + 6, F_BOTTOM - 4)

        return (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_17.5rem]">
            <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
              <Narration icon={shuffle ? <ShuffleIcon className="text-primary" /> : <DicesIcon className="text-primary" />}>{narration}</Narration>

              <VizPanel
                title={t("1 · Tu historia frente a miles de posibles", "1 · Your history against thousands of possible ones")}
                text={
                  trades
                    ? t("Eje horizontal: operaciones. 100 es tu capital inicial. A la derecha, cómo terminan todas las historias.", "Horizontal axis: trades. 100 is your starting capital. On the right, how every history ends.")
                    : t("Eje horizontal: tiempo. 100 es tu capital inicial. A la derecha, cómo terminan todos los mercados sintéticos.", "Horizontal axis: time. 100 is your starting capital. On the right, how every synthetic market ends.")
                }
                hint={t(
                  "Las líneas finas son algunas de las historias simuladas. La zona clara contiene el 90 % de todas ellas (del percentil 5 al 95) y la más intensa, el 50 % central. La línea del medio es la mediana. Las barras de la derecha cuentan en qué valor termina cada simulación.",
                  "The thin lines are some of the simulated histories. The light zone holds 90 % of all of them (percentile 5 to 95) and the darker one the central 50 %. The middle line is the median. The bars on the right count where each simulation ends."
                )}
              >
                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${FAN_H}`} className="w-full touch-pan-y" role="img" aria-label={t("Abanico de historias simuladas", "Fan of simulated histories")} {...fanHover.bind}>
                    <VizDefs id={id} />
                    {fanTicks.map((tick) => (
                      <g key={tick}>
                        <line x1={FX0} x2={MX1} y1={yFan(tick)} y2={yFan(tick)} stroke={tick === 100 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 100 ? undefined : "2 5"} opacity={tick === 100 ? 1 : 0.7} />
                        <text x={FX0 - 8} y={yFan(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
                          {f.signedPct(tick - 100, 0)}
                        </text>
                      </g>
                    ))}
                    {[0, 0.25, 0.5, 0.75, 1].map((u) => (
                      <text key={u} x={FX0 + u * (FX1 - FX0)} y={FAN_H - 10} textAnchor={u === 0 ? "start" : u === 1 ? "end" : "middle"} fontSize={10} fill="var(--muted-foreground)" className="num">
                        {xAxisLabel(u)}
                      </text>
                    ))}
                    <text x={FX0} y={14} fontSize={10} fill="var(--muted-foreground)">
                      {trades ? t("operaciones →", "trades →") : t("tiempo →", "time →")}
                    </text>

                    {/* The distribution of the endings */}
                    <rect x={MX0 - 10} y={F_TOP - 8} width={MX1 - MX0 + 14} height={F_BOTTOM - F_TOP + 16} rx={10} fill="var(--muted)" opacity={0.35} />
                    <text x={MX0} y={14} fontSize={10} fill="var(--muted-foreground)">
                      {t("cómo terminan", "how they end")}
                    </text>
                    <line x1={MX0} x2={MX0} y1={F_TOP - 4} y2={F_BOTTOM + 4} stroke="var(--border-strong)" />
                    {margin.map((count, b) => {
                      if (count === 0) return null
                      const v0 = lo + b * marginStep
                      const y0 = yFan(v0 + marginStep)
                      const h = Math.max(1, yFan(v0) - y0 - 1)
                      const gain = v0 + marginStep / 2 >= 100
                      return (
                        <rect
                          key={b}
                          x={MX0}
                          y={y0 + 0.5}
                          width={Math.max(1.5, barLength(count))}
                          height={h}
                          rx={Math.min(3, h / 2)}
                          fill={gain ? "var(--up)" : "var(--down)"}
                          opacity={mb === null || mb === b ? 0.78 : 0.3}
                        />
                      )
                    })}
                    {settle > 0 && <line x1={FX1} x2={MX1} y1={yFan(final)} y2={yFan(final)} stroke="var(--foreground)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.6 * settle} />}

                    {/* The zone where most of the histories fall */}
                    <g opacity={bandIn}>
                      <path d={bandPath(toPts(bands.p95), toPts(bands.p5))} fill="var(--primary)" opacity={0.1} />
                      <path d={bandPath(toPts(bands.p75), toPts(bands.p25))} fill="var(--primary)" opacity={0.2} />
                      <path d={linePath(toPts(bands.p95))} fill="none" stroke="var(--primary)" strokeWidth={1} strokeDasharray="4 4" opacity={0.55} vectorEffect="non-scaling-stroke" />
                      <path d={linePath(toPts(bands.p5))} fill="none" stroke="var(--primary)" strokeWidth={1} strokeDasharray="4 4" opacity={0.55} vectorEffect="non-scaling-stroke" />
                    </g>

                    {/* A few whole histories, drawn one after another, each leaving its ending in the distribution */}
                    {summary.samples.map((curve, k) => {
                      const start = REAL_END + (k / Math.max(1, sampleCount)) * (SIM_END - REAL_END - 34)
                      const u = easeOutCubic(phase(pos, start, 34))
                      if (u <= 0) return null
                      const shown = partial(curve, u)
                      const end = curve[curve.length - 1]
                      const tip = shown.at(-1)
                      const colour = signVar(end - 100)
                      return (
                        <g key={k}>
                          <path d={linePath(shown)} fill="none" stroke={colour} strokeWidth={u < 1 ? 1.6 : 1.1} strokeLinejoin="round" opacity={u < 1 ? 0.7 : 0.22} vectorEffect="non-scaling-stroke" />
                          {u < 1 && tip && (
                            <>
                              <circle cx={tip.x} cy={tip.y} r={6} fill={colour} opacity={0.18} />
                              <circle cx={tip.x} cy={tip.y} r={2.6} fill={colour} />
                            </>
                          )}
                          {u >= 1 && <circle cx={FX1} cy={yFan(end)} r={2.2 * easeOutBack(phase(pos, start + 34, 8))} fill={colour} opacity={0.7} />}
                        </g>
                      )
                    })}

                    {/* Simulations dropping into the distribution */}
                    {!finished &&
                      balls.map((ball, k) => {
                        const age = pos - ball.at
                        if (age < 0 || age > BALL_FLIGHT) return null
                        const u = easeOutCubic(age / BALL_FLIGHT)
                        const b = binOfValue(ball.value)
                        const target = MX0 + barLength(margin[b]) + 3
                        const y = yFan(clamp(ball.value, lo, hi))
                        const colour = signVar(ball.value - 100)
                        return (
                          <g key={k} opacity={1 - phase(age, BALL_FLIGHT - 4, 4)} pointerEvents="none">
                            <line x1={FX1 + (target - FX1) * Math.max(0, u - 0.25)} x2={FX1 + (target - FX1) * u} y1={y} y2={y} stroke={colour} strokeWidth={2} strokeLinecap="round" opacity={0.35} />
                            <circle cx={FX1 + (target - FX1) * u} cy={y} r={3} fill={colour} stroke="var(--card)" strokeWidth={1} />
                          </g>
                        )
                      })}

                    <path d={linePath(toPts(bands.p50))} fill="none" stroke="var(--primary)" strokeWidth={2.4} strokeLinecap="round" opacity={bandIn} vectorEffect="non-scaling-stroke" filter={glow(id)} />

                    {/* The real one, on top of everything */}
                    {realPts.length > 1 && (
                      <>
                        <path d={linePath(realPts)} fill="none" stroke="var(--card)" strokeWidth={6.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        <path d={linePath(realPts)} fill="none" stroke="var(--foreground)" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" filter={glow(id)} />
                      </>
                    )}
                    {head && realU < 1 && (
                      <>
                        <circle cx={head.x} cy={head.y} r={5.5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2.5} filter={glow(id)} />
                        <Tag x={clamp(head.x, FX0 + 40, FX1 - 40)} y={clamp(head.y - 20, F_TOP - 12, F_BOTTOM)} text={f.signedPct(realRet)} colour={signVar(realRet)} />
                      </>
                    )}
                    {realU >= 1 && <circle cx={FX1} cy={yFan(final)} r={5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2.5} />}

                    {/* Live counter while it runs */}
                    {running && <Tag x={FX0 + 8} y={F_TOP - 2} anchor="start" text={t(`simulación ${f.count.format(seen)} / ${f.count.format(runs)}`, `simulation ${f.count.format(seen)} / ${f.count.format(runs)}`)} colour="var(--primary)" size={10} />}

                    {/* Where the main lines end */}
                    {settle > 0 && fk === null && (
                      <g opacity={settle}>
                        {!shuffle && <Tag x={FX1 - 62} y={tagYs[0]} text={`P95 ${f.signedPct(lastBand(bands.p95) - 100, 0)}`} colour="var(--up)" size={10} />}
                        {!shuffle && <Tag x={FX1 - 62} y={tagYs[1]} text={`${t("mediana", "median")} ${f.signedPct(lastBand(bands.p50) - 100, 0)}`} colour="var(--primary)" size={10} />}
                        {!shuffle && <Tag x={FX1 - 62} y={tagYs[2]} text={`P5 ${f.signedPct(lastBand(bands.p5) - 100, 0)}`} colour="var(--down)" size={10} />}
                        <Tag x={FX1 - 62} y={tagYs[3]} text={`${shuffle ? t("final", "final") : t("real", "real")} ${f.signedPct(summary.real.returnPct, 0)}`} colour="var(--foreground)" size={10} />
                      </g>
                    )}

                    {fk !== null && (
                      <>
                        <Crosshair x={xFan(fk)} top={F_TOP} bottom={F_BOTTOM} />
                        <HoverDot x={xFan(fk)} y={yFan(summary.bands.p95[fk])} colour="var(--up)" r={3.2} />
                        <HoverDot x={xFan(fk)} y={yFan(summary.bands.p50[fk])} colour="var(--primary)" r={4} />
                        <HoverDot x={xFan(fk)} y={yFan(summary.bands.p5[fk])} colour="var(--down)" r={3.2} />
                        <HoverDot x={xFan(fk)} y={yFan(summary.real.curve[fk])} colour="var(--foreground)" />
                      </>
                    )}
                    {mb !== null && <rect x={MX0 - 8} y={yFan(lo + (mb + 1) * marginStep)} width={MX1 - MX0 + 10} height={Math.max(2, yFan(lo + mb * marginStep) - yFan(lo + (mb + 1) * marginStep))} rx={3} fill="none" stroke="var(--foreground)" strokeWidth={1.2} />}
                  </svg>
                  {fk !== null && (
                    <ChartTip x={xFan(fk)} y={yFan(summary.bands.p50[fk])} width={W} height={FAN_H}>
                      <TipTitle>{xLabel(fk / Math.max(1, points - 1))}</TipTitle>
                      <TipRow label={t("Tu historia real", "Your real history")} value={f.signedPct(summary.real.curve[fk] - 100)} colour="var(--foreground)" valueColour={signVar(summary.real.curve[fk] - 100)} strong />
                      <TipRow label={t("Caso favorable (P95)", "Favourable case (P95)")} value={f.signedPct(summary.bands.p95[fk] - 100)} colour="var(--up)" />
                      <TipRow label="P75" value={f.signedPct(summary.bands.p75[fk] - 100)} />
                      <TipRow label={t("Mediana (P50)", "Median (P50)")} value={f.signedPct(summary.bands.p50[fk] - 100)} colour="var(--primary)" />
                      <TipRow label="P25" value={f.signedPct(summary.bands.p25[fk] - 100)} />
                      <TipRow label={t("Caso desfavorable (P5)", "Unfavourable case (P5)")} value={f.signedPct(summary.bands.p5[fk] - 100)} colour="var(--down)" />
                    </ChartTip>
                  )}
                  {mb !== null && (
                    <ChartTip x={MX0} y={yFan(lo + (mb + 0.5) * marginStep)} width={W} height={FAN_H}>
                      <TipTitle>
                        {t("Terminan entre", "End between")} {f.signedPct(lo + mb * marginStep - 100, 1)} {t("y", "and")} {f.signedPct(lo + (mb + 1) * marginStep - 100, 1)}
                      </TipTitle>
                      <TipRow label={t("Simulaciones", "Simulations")} value={f.count.format(marginFinal[mb])} strong />
                      <TipRow label={t("Del total", "Of the total")} value={`${f.decimal1.format((marginFinal[mb] / runs) * 100)} %`} />
                    </ChartTip>
                  )}
                </div>
                <LegendRow
                  items={[
                    { label: t("Tu historia real", "Your real history"), colour: "var(--foreground)" },
                    { label: t("Simulación que gana / pierde", "Simulation that wins / loses"), colour: "var(--up)", dot: true },
                    { label: t("Mediana y zona del 50 % / 90 % de los casos", "Median and the zone of 50 % / 90 % of cases"), colour: "var(--primary)" },
                  ]}
                />
              </VizPanel>

              <VizPanel
                title={shuffle ? t("2 · Cuánto cae en cada orden", "2 · How far it falls in each order") : t("2 · Cómo terminan las historias", "2 · How the histories end")}
                text={
                  shuffle
                    ? t("Cada barra cuenta las historias con esa caída máxima. Las operaciones son las mismas; solo cambia el orden.", "Each bar counts the histories with that maximum drawdown. The trades are the same; only the order changes.")
                    : t("Cada barra cuenta las historias que terminan con ese resultado. Verde: ganan. Rojo: pierden.", "Each bar counts the histories that end with that result. Green: win. Red: lose.")
                }
              >
                <ResultsHistogram id={id} pos={pos} seen={seen} hist={hist} metric={metric} maxCount={maxCount} real={realMetric} drawdown={shuffle} settle={settle} stats={st} finished={finished} runs={runs} t={t} f={f} />
              </VizPanel>

              {!shuffle && (
                <VizPanel
                  title={t("3 · Cuánto puede caer por el camino", "3 · How far it can fall on the way")}
                  text={t("Caída máxima desde un máximo en cada historia. Una caída del 50 % obliga a ganar un 100 % para recuperarse.", "Maximum drop from a peak in each history. A 50 % drop needs a 100 % gain to recover.")}
                >
                  <RiskMeter id={id} stats={st} real={summary.real.maxDrawdownPct} drawdowns={summary.drawdowns} settle={settle} finished={finished} t={t} f={f} />
                </VizPanel>
              )}
            </div>

            <aside className="flex flex-col gap-3 border-t p-3 sm:p-4 lg:border-t-0 lg:border-l">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-bold">{finished ? t("Resumen", "Summary") : t("En directo", "Live")}</h3>
                <span className="num text-[11px] text-muted-foreground">
                  {f.count.format(seen)} / {f.count.format(runs)}
                </span>
              </div>
              <span className="relative h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(seen / runs) * 100}%` }} />
              </span>
              <div className="flex items-center gap-3">
                <Ring value={winShare / 100} tone={!st ? "mixed" : winShare >= 70 ? "good" : winShare >= 50 ? "mixed" : "bad"} label={t("Historias que ganan", "Histories that win")}>
                  <span className="text-title">{st ? `${Math.round(winShare)}%` : "—"}</span>
                  <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">{t("ganan", "win")}</span>
                </Ring>
                <p className="num text-caption text-muted-foreground">
                  {st
                    ? shuffle
                      ? t("Con las mismas operaciones, el resultado final no cambia; solo el camino.", "With the same trades, the final result doesn't change; only the path.")
                      : t(`${f.count.format(Math.round((st.probProfit / 100) * seen))} de ${f.count.format(seen)} historias terminan en positivo.`, `${f.count.format(Math.round((st.probProfit / 100) * seen))} of ${f.count.format(seen)} histories end positive.`)
                    : t("Aún no hay simulaciones.", "No simulations yet.")}
                </p>
              </div>
              <RangeBar stats={st} shuffle={shuffle} hist={hist} real={realMetric} t={t} f={f} />
              <Convergence points={convergence} seen={seen} runs={runs} shuffle={shuffle} t={t} f={f} />
              <dl className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {!shuffle && <StatTile label={t("Resultado típico", "Typical result")} value={st ? f.signedPct(st.returnPct.p50) : "—"} sub={t("la mediana", "the median")} tone={st ? (st.returnPct.p50 > 0 ? "good" : "bad") : undefined} />}
                <StatTile label={t("Caída habitual", "Usual drawdown")} value={st ? `−${f.pct(st.drawdownPct.p50)}` : "—"} sub={t("la mediana", "the median")} />
                <StatTile label={t("Caída en un caso desfavorable", "Drawdown in an unfavourable case")} value={st ? `−${f.pct(st.drawdownPct.p95)}` : "—"} sub={t("1 de cada 20 cae más", "1 in 20 falls more")} tone={st ? (st.drawdownPct.p95 < DD_HIGH ? "good" : st.drawdownPct.p95 < DD_SEVERE ? "mixed" : "bad") : undefined} />
              </dl>
              {finished && <p className="text-[11px] text-muted-foreground">{t("Pasa el ratón por los gráficos para leer cada punto. Pulsa R para repetir.", "Hover over the charts to read each point. Press R to replay.")}</p>}
            </aside>
          </div>
        )
      }}
      results={<McResults run={run} summary={summary} report={report} />}
    />
  )
}

// --- Live range and convergence ---------------------------------------------------------------------------

/** Where the results are falling so far: the central 90 % and 50 % of them, the median, zero and the real one. */
function RangeBar({ stats, shuffle, hist, real, t, f }: { stats: ReturnType<typeof mcStats> | null; shuffle: boolean; hist: Histogram; real: number; t: T; f: F }) {
  const RW = 250
  const RH = 64
  const x = linear(hist.lo, hist.hi, 10, RW - 10)
  const q = stats ? (shuffle ? stats.drawdownPct : stats.returnPct) : null
  const show = (v: number) => (shuffle ? `−${f.pct(v, 0)}` : f.signedPct(v, 0))
  const mid = 30
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {shuffle ? t("Rango probable de la caída", "Likely range of the drawdown") : t("Rango probable del resultado", "Likely range of the result")}
        <Hint title={shuffle ? t("Rango probable de la caída", "Likely range of the drawdown") : t("Rango probable del resultado", "Likely range of the result")}>
          {t(
            "La barra fina va del percentil 5 al 95: contiene 9 de cada 10 simulaciones. La gruesa, del 25 al 75 (la mitad central). La raya blanca es la mediana y el triángulo, tu resultado real.",
            "The thin bar goes from percentile 5 to 95: it holds 9 out of 10 simulations. The thick one, from 25 to 75 (the central half). The white tick is the median and the triangle your real result."
          )}
        </Hint>
      </p>
      <svg viewBox={`0 0 ${RW} ${RH}`} className="w-full" role="img" aria-label={t("Rango probable", "Likely range")}>
        <rect x={10} y={mid - 2} width={RW - 20} height={4} rx={2} fill="var(--muted)" />
        {!shuffle && hist.lo < 0 && hist.hi > 0 && <line x1={x(0)} x2={x(0)} y1={mid - 14} y2={mid + 14} stroke="var(--foreground)" strokeDasharray="2 2" opacity={0.5} />}
        {q && (
          <g>
            <rect x={x(q.p5)} y={mid - 4} width={Math.max(2, x(q.p95) - x(q.p5))} height={8} rx={4} fill="var(--primary)" opacity={0.3} />
            <rect x={x(q.p25)} y={mid - 7} width={Math.max(2, x(q.p75) - x(q.p25))} height={14} rx={7} fill="var(--primary)" opacity={0.75} />
            <line x1={x(q.p50)} x2={x(q.p50)} y1={mid - 9} y2={mid + 9} stroke="var(--background)" strokeWidth={2.5} />
            <text x={x(q.p5)} y={RH - 6} fontSize={9.5} textAnchor="middle" fill={shuffle ? "var(--muted-foreground)" : signVar(q.p5)} className="num">
              {show(q.p5)}
            </text>
            <text x={x(q.p95)} y={RH - 6} fontSize={9.5} textAnchor="middle" fill={shuffle ? "var(--muted-foreground)" : signVar(q.p95)} className="num">
              {show(q.p95)}
            </text>
            <text x={x(q.p50)} y={12} fontSize={9.5} fontWeight={700} textAnchor="middle" fill="var(--primary)" className="num">
              {show(q.p50)}
            </text>
          </g>
        )}
        <path d={trianglePath(x(real), mid + 13, 4.5, true)} fill="var(--foreground)" />
      </svg>
    </div>
  )
}

/** How the estimate moves as simulations are added: when the line flattens, more of them would hardly change it. */
function Convergence({ points, seen, runs, shuffle, t, f }: { points: { n: number; v: number }[]; seen: number; runs: number; shuffle: boolean; t: T; f: F }) {
  const id = useSvgId()
  const CW = 250
  const CH = 78
  const shown = points.filter((p) => p.n <= seen)
  const vals = points.map((p) => p.v)
  const [vLo, vHi] = shuffle ? pad(extent([0, ...vals]), 0.1) : [0, 100]
  const x = (n: number) => 6 + (n / runs) * (CW - 12)
  const y = linear(vLo, vHi, CH - 8, 8)
  const pts = shown.map((p) => ({ x: x(p.n), y: y(p.v) }))
  const last = shown.at(-1)
  const title = t("Estabilidad de la estimación", "Stability of the estimate")
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {title}
        <Hint title={title}>
          {shuffle
            ? t("Cómo cambia la caída del caso desfavorable (percentil 95) a medida que se suman simulaciones. Cuando la línea se aplana, añadir más simulaciones apenas cambiaría la conclusión.", "How the unfavourable-case drawdown (percentile 95) changes as simulations are added. When the line flattens, more simulations would hardly change the conclusion.")
            : t("Cómo cambia el porcentaje de historias que ganan a medida que se suman simulaciones. Cuando la línea se aplana, añadir más simulaciones apenas cambiaría la conclusión.", "How the share of winning histories changes as simulations are added. When the line flattens, more simulations would hardly change the conclusion.")}
        </Hint>
      </p>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full" role="img" aria-label={title}>
        <VizDefs id={id} />
        {!shuffle && <line x1={6} x2={CW - 6} y1={y(50)} y2={y(50)} stroke="var(--border-strong)" strokeDasharray="2 3" />}
        {pts.length > 1 && <path d={`${linePath(pts)}L${pts.at(-1)!.x} ${CH - 8}L${pts[0].x} ${CH - 8}Z`} fill={paint(id, "primary")} />}
        {pts.length > 1 && <path d={linePath(pts)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" filter={glow(id)} />}
        {last && (
          <>
            <circle cx={x(last.n)} cy={y(last.v)} r={3.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={1.6} />
            <text x={clamp(x(last.n), 30, CW - 30)} y={Math.max(10, y(last.v) - 7)} fontSize={9.5} fontWeight={700} textAnchor="middle" fill="var(--primary)" className="num">
              {shuffle ? `−${f.pct(last.v, 0)}` : f.pct(last.v, 0)}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

// --- Histogram ---------------------------------------------------------------------------------------

const H_W = W
const HX0 = 30
const HX1 = W - 30
const H_H = 236
const H_TOP = 54
const H_BASE = H_H - 50

function ResultsHistogram({
  id,
  pos,
  seen,
  hist,
  metric,
  maxCount,
  real,
  drawdown,
  settle,
  stats,
  finished,
  runs,
  t,
  f,
}: {
  id: string
  pos: number
  seen: number
  hist: Histogram
  metric: number[]
  maxCount: number
  real: number
  drawdown: boolean
  settle: number
  stats: ReturnType<typeof mcStats> | null
  finished: boolean
  runs: number
  t: T
  f: F
}) {
  const hover = useChartHover(H_W, H_H)
  const counts = histogramAt(metric, hist, seen)
  const width = (HX1 - HX0) / hist.bins
  const x = linear(hist.lo, hist.hi, HX0, HX1)
  const y = linear(0, maxCount * 1.12, H_BASE, H_TOP)
  const ticks = niceTicks(hist.lo, hist.hi, 7)
  const centre = (bin: number) => hist.lo + ((bin + 0.5) * (hist.hi - hist.lo)) / hist.bins
  const edge = (bin: number) => hist.lo + (bin * (hist.hi - hist.lo)) / hist.bins
  const wins = stats ? stats.probProfit : 0
  const zero = x(0)
  const hb = finished && hover.at ? clamp(Math.floor((hover.at.x - HX0) / width), 0, hist.bins - 1) : null
  const show = (v: number) => (drawdown ? (Math.abs(v) < 1e-9 ? "0 %" : `−${f.pct(v, 1)}`) : f.signedPct(v, 1))
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${H_W} ${H_H}`} className="w-full touch-pan-y" role="img" aria-label={t("Histograma de resultados simulados", "Histogram of simulated results")} {...hover.bind}>
        <VizDefs id={`${id}h`} />
        <line x1={HX0} x2={HX1} y1={H_BASE} y2={H_BASE} stroke="var(--border-strong)" />
        {ticks.map((tick) => (
          <text key={tick} x={x(tick)} y={H_H - 10} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)" className="num">
            {drawdown ? (tick === 0 ? "0 %" : `−${f.pct(tick, 0)}`) : f.signedPct(tick + 0, 0)}
          </text>
        ))}
        {!drawdown && (
          <>
            <line x1={zero} x2={zero} y1={H_TOP - 14} y2={H_BASE} stroke="var(--foreground)" strokeWidth={1.25} strokeDasharray="5 4" opacity={0.7} />
            {stats && (
              <g className="num" fontSize={12} fontWeight={700}>
                <text x={clamp(zero - 8, 80, HX1)} y={18} textAnchor="end" fill="var(--down)">
                  {t(`pierden ${f.pct(100 - wins, 0)}`, `lose ${f.pct(100 - wins, 0)}`)}
                </text>
                <text x={clamp(zero + 8, HX0, HX1 - 90)} y={18} fill="var(--up)">
                  {t(`ganan ${f.pct(wins, 0)}`, `win ${f.pct(wins, 0)}`)}
                </text>
              </g>
            )}
          </>
        )}
        {hb !== null && <rect x={HX0 + hb * width} y={H_TOP - 16} width={width} height={H_BASE - H_TOP + 16} rx={4} fill="var(--primary)" opacity={0.08} />}
        {counts.map((count, bin) => {
          if (count === 0) return null
          const h = H_BASE - y(count)
          const loss = drawdown ? centre(bin) >= DD_SEVERE : centre(bin) < 0
          const calm = drawdown && !loss
          const fill = drawdown ? (loss ? "down" : "primary") : centre(bin) >= 0 ? "up" : "down"
          return (
            <rect
              key={bin}
              x={HX0 + bin * width + 1}
              y={H_BASE - h}
              width={Math.max(1, width - 2)}
              height={h}
              rx={Math.min(4, width / 3)}
              fill={paint(`${id}h`, fill)}
              stroke={calm ? "var(--primary)" : fill === "up" ? "var(--up)" : "var(--down)"}
              strokeWidth={hb === bin ? 2.4 : 1.4}
              opacity={hb === null || hb === bin ? 1 : 0.55}
            />
          )
        })}
        {drawdown && (
          <g>
            <line x1={x(DD_SEVERE)} x2={x(DD_SEVERE)} y1={H_TOP - 14} y2={H_BASE} stroke="var(--down)" strokeWidth={1.25} strokeDasharray="5 4" opacity={0.7} />
            <text x={x(DD_SEVERE) + 6} y={18} fontSize={11} fontWeight={700} fill="var(--down)">
              {t("caída superior al 50 %", "drawdown over 50 %")}
            </text>
          </g>
        )}
        {stats && seen > 20 && !drawdown && (
          <g>
            {[stats.returnPct.p5, stats.returnPct.p50, stats.returnPct.p95].map((value, k) => (
              <line key={k} x1={x(value)} x2={x(value)} y1={H_BASE - 4} y2={H_BASE + 6} stroke="var(--foreground)" strokeWidth={2} opacity={0.9} />
            ))}
            <Tag x={clamp(x(stats.returnPct.p50), HX0 + 44, HX1 - 44)} y={H_BASE + 17} text={`${t("mediana", "median")} ${f.signedPct(stats.returnPct.p50, 0)}`} colour="var(--primary)" size={10} />
          </g>
        )}
        {settle > 0 && (
          <g opacity={settle}>
            <path d={trianglePath(x(real), H_BASE - 6, 7, false)} fill="var(--foreground)" stroke="var(--card)" strokeWidth={1.5} />
            <Tag x={clamp(x(real), HX0 + 46, HX1 - 46)} y={H_TOP - 6 + (1 - settle) * 8} text={`${t("tu resultado", "your result")} ${drawdown ? `−${f.pct(real, 0)}` : f.signedPct(real, 0)}`} colour="var(--foreground)" size={10} />
          </g>
        )}
        {pos > 0 && seen < 3 && (
          <text x={W / 2} y={H_BASE - 50} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)">
            {t("Las barras aparecerán según se simulen las historias…", "Bars will appear as the histories are simulated…")}
          </text>
        )}
      </svg>
      {hb !== null && (
        <ChartTip x={HX0 + (hb + 0.5) * width} y={Math.max(H_TOP, H_BASE - (H_BASE - y(counts[hb])) - 10)} width={H_W} height={H_H}>
          <TipTitle>
            {drawdown ? t("Caída máxima entre", "Max drawdown between") : t("Resultado entre", "Result between")} {show(edge(hb))} {t("y", "and")} {show(edge(hb + 1))}
          </TipTitle>
          <TipRow label={t("Simulaciones", "Simulations")} value={f.count.format(counts[hb])} strong />
          <TipRow label={t("Del total", "Of the total")} value={`${f.decimal1.format((counts[hb] / runs) * 100)} %`} />
        </ChartTip>
      )}
    </div>
  )
}

// --- Drawdown strip ----------------------------------------------------------------------------------

const R_H = 140
const RX0 = 30
const RX1 = W - 30

function RiskMeter({ id, stats, real, drawdowns, settle, finished, t, f }: { id: string; stats: ReturnType<typeof mcStats> | null; real: number; drawdowns: number[]; settle: number; finished: boolean; t: T; f: F }) {
  const hover = useChartHover(W, R_H)
  const max = Math.max(60, Math.ceil(Math.max(...drawdowns, real) / 10) * 10)
  const x = linear(0, max, RX0, RX1)
  const mid = 52
  const ticks = niceTicks(0, max, 6)
  const hv = finished && hover.at ? clamp(((hover.at.x - RX0) / (RX1 - RX0)) * max, 0, max) : null
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${R_H}`} className="w-full touch-pan-y" role="img" aria-label={t("Caída máxima de las historias", "Maximum drawdown of the histories")} {...hover.bind}>
        <VizDefs id={`${id}r`} />
        <rect x={RX0} y={mid - 12} width={x(DD_HIGH) - RX0} height={24} rx={6} fill="var(--up)" opacity={0.1} />
        <rect x={x(DD_HIGH)} y={mid - 12} width={x(DD_SEVERE) - x(DD_HIGH)} height={24} fill="var(--chart-3)" opacity={0.14} />
        <rect x={x(DD_SEVERE)} y={mid - 12} width={RX1 - x(DD_SEVERE)} height={24} rx={6} fill="var(--down)" opacity={0.14} />
        {ticks.map((tick) => (
          <text key={tick} x={x(tick)} y={R_H - 8} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)" className="num">
            {tick === 0 ? "0 %" : `−${f.pct(tick, 0)}`}
          </text>
        ))}
        <text x={RX0 + 6} y={mid - 20} fontSize={10} fill="var(--up)" fontWeight={700}>
          {t("moderada", "moderate")}
        </text>
        <text x={x(DD_HIGH) + 6} y={mid - 20} fontSize={10} fill="var(--chart-3)" fontWeight={700}>
          {t("elevada", "high")}
        </text>
        <text x={x(DD_SEVERE) + 6} y={mid - 20} fontSize={10} fill="var(--down)" fontWeight={700}>
          {t("severa", "severe")}
        </text>
        {stats && (
          <g>
            <rect x={x(stats.drawdownPct.p5)} y={mid - 6} width={Math.max(2, x(stats.drawdownPct.p95) - x(stats.drawdownPct.p5))} height={12} rx={6} fill="var(--primary)" opacity={0.32} />
            <rect x={x(stats.drawdownPct.p25)} y={mid - 9} width={Math.max(2, x(stats.drawdownPct.p75) - x(stats.drawdownPct.p25))} height={18} rx={9} fill="var(--primary)" opacity={0.7} />
            <line x1={x(stats.drawdownPct.p50)} x2={x(stats.drawdownPct.p50)} y1={mid - 13} y2={mid + 13} stroke="var(--background)" strokeWidth={3} />
            {hv === null && <Tag x={clamp(x(stats.drawdownPct.p95), RX0 + 40, RX1 - 40)} y={mid + 32} text={`${t("1 de cada 20 cae más de", "1 in 20 falls more than")} ${f.pct(stats.drawdownPct.p95, 0)}`} colour="var(--primary)" size={10} />}
          </g>
        )}
        {settle > 0 && hv === null && (
          <g opacity={settle}>
            <path d={trianglePath(x(real), mid + 18, 6, true)} fill="var(--foreground)" stroke="var(--card)" strokeWidth={1.5} />
            <Tag x={clamp(x(real), RX0 + 50, RX1 - 50)} y={mid + 58} text={`${t("tu caída real", "your real drawdown")} −${f.pct(real, 0)}`} colour="var(--foreground)" size={10} />
          </g>
        )}
        {hv !== null && <Crosshair x={x(hv)} top={mid - 20} bottom={mid + 22} />}
      </svg>
      {hv !== null && (
        <ChartTip x={x(hv)} y={mid} width={W} height={R_H}>
          <TipTitle>
            {t("Caída de más del", "Drawdown over")} {f.pct(hv, 0)}
          </TipTitle>
          <TipRow label={t("Historias que la superan", "Histories beyond it")} value={`${f.decimal1.format(100 - rankOf(drawdowns, hv))} %`} strong />
          <TipRow label={t("Recuperarse exigiría", "Recovering would need")} value={hv >= 99.9 ? "—" : f.signedPct((100 / (100 - hv) - 1) * 100, 0)} />
        </ChartTip>
      )}
    </div>
  )
}

// --- Verdict and results -------------------------------------------------------------------------------

function headline(report: McReport, summary: McSummary, t: T): [string, string] {
  const h = report.headline
  if (summary.method === "shuffle") {
    if (h === "solid") return [t("El orden de las operaciones apenas importa", "The order of the trades hardly matters"), t("Aunque las operaciones llegaran en otro orden, la caída seguiría siendo llevadera.", "Even if the trades came in another order, the drawdown would still be bearable.")]
    if (h === "decent") return [t("El orden influye en las caídas", "The order affects the drawdowns"), t("El resultado final es el mismo, pero con un orden desfavorable la caída sería bastante mayor que la real.", "The final result is the same, but with an unfavourable order the drawdown would be much larger than the real one.")]
    if (h === "risky") return [t("Una mala racha podría ser muy dura", "A bad streak could be very hard"), t("Con el orden menos favorable la caída sería mucho mayor que la real. Valora si podrías soportarla.", "With the least favourable order the drawdown would be much larger than the real one. Consider whether you could endure it.")]
    return [t("En conjunto, las operaciones pierden", "Taken together, the trades lose"), t("Sea cual sea el orden, la suma de tus operaciones no gana dinero.", "Whatever the order, your trades add up to a loss.")]
  }
  const word = summary.source === "paths" ? t("mercados", "markets") : t("historias", "histories")
  if (h === "solid") return [t("Resiste: gana en la mayoría de casos", "It holds up: it wins in most cases"), t(`Ganó dinero en la mayoría de los ${word} simulados y con caídas razonables. No parece fruto del azar.`, `It made money in most of the simulated ${word} with reasonable drawdowns. It doesn't look like chance.`)]
  if (h === "decent") return [t("Resultado razonable, con reservas", "A reasonable result, with reservations"), t("Gana más veces de las que pierde, pero los escenarios desfavorables son duros. Revisa el riesgo antes de confiar en ella.", "It wins more often than it loses, but the unfavourable scenarios are tough. Check the risk before relying on it.")]
  if (h === "risky") return [t("Arriesgada: depende mucho del azar", "Risky: it depends heavily on chance"), t("El resultado cambia mucho de una historia a otra y los casos desfavorables caen con fuerza.", "The result changes a lot from one history to another and the unfavourable cases fall hard.")]
  return [t("Pierde en la mayoría de casos", "It loses in most cases"), t(`En más de la mitad de los ${word} simulados termina en negativo. El resultado real pudo deberse al azar.`, `In more than half of the simulated ${word} it ends negative. The real result may have been down to chance.`)]
}

function criterionText(c: McCriterion, summary: McSummary, t: T): { label: string; hint: string; more: string } {
  switch (c.id) {
    case "profit":
      return {
        label: summary.source === "paths" ? t("Mercados en positivo", "Markets in profit") : t("Historias en positivo", "Histories in profit"),
        hint: t("Bien a partir del 70 %", "Good from 70 %"),
        more: t("Porcentaje de simulaciones que terminan con beneficio. Es la probabilidad estimada de ganar dinero si el futuro se parece a las condiciones simuladas.", "Share of simulations that end with a profit. It is the estimated chance of making money if the future resembles the simulated conditions."),
      }
    case "tail":
      return {
        label: t("Caso desfavorable (P5)", "Unfavourable case (P5)"),
        hint: t("Bien si no pierde más del 10 %", "Good if it loses no more than 10 %"),
        more: t("Resultado que solo empeoran 5 de cada 100 simulaciones. Sirve para valorar cuánto se podría perder en un escenario adverso pero plausible.", "Result that only 5 in 100 simulations do worse than. It helps judge how much could be lost in an adverse but plausible scenario."),
      }
    case "drawdown":
      return {
        label: t("Caída en un caso desfavorable", "Drawdown in an unfavourable case"),
        hint: t("Bien por debajo del 30 %", "Good below 30 %"),
        more: t("Caída máxima desde un máximo que superan 5 de cada 100 simulaciones. Indica la peor racha razonable que habría que soportar.", "Maximum drop from a peak exceeded by 5 in 100 simulations. It shows the worst reasonable stretch you would have to endure."),
      }
    case "luck":
      return {
        label: t("Posición del resultado real", "Position of the real result"),
        hint: t("Bien si supera a menos del 85 %", "Good if it beats under 85 %"),
        more: t("Percentil del resultado real entre las simulaciones. Si supera a casi todas, es probable que el periodo histórico fuera especialmente favorable y que no se repita.", "Percentile of the real result among the simulations. If it beats almost all of them, the historical period was probably unusually favourable and may not repeat."),
      }
    default:
      return {
        label: t("Peor orden frente al real", "Worst order vs the real one"),
        hint: t("Bien hasta 1,5 veces la caída real", "Good up to 1.5 times the real drawdown"),
        more: t("Cuántas veces mayor sería la caída en un orden desfavorable (percentil 95) que la caída que se produjo realmente.", "How many times larger the drawdown would be in an unfavourable order (percentile 95) than the one that actually happened."),
      }
  }
}

function McVerdict({ report, summary, strategyName }: { report: McReport; summary: McSummary; strategyName: string }) {
  const { t, f } = useReplayText()
  const [title, lead] = headline(report, summary, t)
  const format = (c: McCriterion) =>
    c.id === "profit" && summary.method === "shuffle"
      ? f.signedPct(c.value)
      : c.id === "profit"
        ? `${Math.round(c.value)} %`
        : c.id === "tail"
          ? f.signedPct(c.value)
          : c.id === "drawdown"
            ? `−${f.pct(c.value)}`
            : c.id === "luck"
              ? t(`percentil ${Math.round(c.value)}`, `percentile ${Math.round(c.value)}`)
              : `×${f.decimal1.format(c.value)}`
  return (
    <Reveal label={t("Veredicto de Monte Carlo", "Monte Carlo verdict")} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <Seal tone={report.tone} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cn("bt-fade text-[11px] font-semibold tracking-wide uppercase", toneText(report.tone))} style={delay(0.2)}>
            {t("Veredicto de Monte Carlo", "Monte Carlo verdict")} · {strategyName}
          </p>
          <h3 className="bt-rise text-heading leading-tight font-bold tracking-tight text-balance" style={delay(0.3)}>
            {title}
          </h3>
          <p className="bt-rise text-muted-foreground" style={delay(0.45)}>
            {lead}
          </p>
        </div>
        <ScoreRing score={report.score} tone={report.tone} />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("Semáforo por criterio", "Traffic light by criterion")}>
        {report.criteria.map((c, i) => {
          const text = criterionText(c, summary, t)
          return (
            <li key={c.id} className={cn("bt-rise flex min-w-0 flex-col gap-0.5 rounded-lg p-3", toneSoft(c.tone))} style={delay(0.55 + i * 0.1)}>
              <span className="flex items-center gap-2 text-caption text-muted-foreground">
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", toneBg(c.tone))} />
                <span className="truncate">{text.label}</span>
                <Hint title={text.label}>{text.more}</Hint>
              </span>
              <span className={cn("num text-title font-bold", toneText(c.tone))}>{format(c)}</span>
              <span className="text-[11px] text-muted-foreground">{text.hint}</span>
            </li>
          )
        })}
      </ul>
    </Reveal>
  )
}

function ScoreRing({ score, tone }: { score: number; tone: McReport["tone"] }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`${score} / 100`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--muted)" strokeWidth={6} />
        <circle cx={32} cy={32} r={r} fill="none" className={toneText(tone)} stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className={cn("num absolute inset-0 flex items-center justify-center text-title font-bold", toneText(tone))}>{score}</span>
    </div>
  )
}

function McResults({ run, summary, report }: { run: McRun; summary: McSummary; report: McReport }) {
  const { t, f } = useReplayText()
  const { stats } = report
  const shuffle = summary.method === "shuffle"
  const paths = summary.source === "paths"
  const tone = (v: number) => (v > 0 ? ("good" as const) : ("bad" as const))
  const notes: string[] = []
  if (paths)
    notes.push(
      t(
        `Los mercados sintéticos se construyen dividiendo el precio real en bloques de ${summary.blockLength} velas consecutivas y uniéndolos en un orden aleatorio: conservan el comportamiento del mercado, pero no son predicciones. Con la misma semilla (${summary.seed}) se obtiene siempre el mismo resultado.`,
        `The synthetic markets are built by splitting the real price into blocks of ${summary.blockLength} consecutive candles and joining them in a random order: they keep the market's behaviour but they are not predictions. The same seed (${summary.seed}) always gives the same result.`
      )
    )
  else
    notes.push(
      shuffle
        ? t("Se usan solo las operaciones cerradas de tu backtest. Cambiar su orden no altera el resultado final, pero sí la caída máxima por el camino.", "Only the closed trades of your backtest are used. Changing their order doesn't alter the final result, but it does change the maximum drawdown on the way.")
        : t("Se usan solo las operaciones cerradas de tu backtest, extraídas al azar con reemplazo: cada historia es una combinación posible de operaciones parecidas a las reales.", "Only the closed trades of your backtest are used, drawn at random with replacement: each history is a possible combination of trades like the real ones.")
    )
  notes.push(t("Es una estimación: con pocas operaciones o un rango corto, la imagen que ofrece es menos fiable.", "It is an estimate: with few trades or a short range, the picture it gives is less reliable."))

  const method = paths
    ? t(
        `Se fabricaron ${f.count.format(summary.runs)} mercados alternativos a partir de tramos reales del precio y se ejecutó tu estrategia en cada uno. Así se comprueba si su resultado depende de la secuencia concreta que vivió el mercado o se mantiene en mercados de carácter parecido.`,
        `${f.count.format(summary.runs)} alternative markets were built from real stretches of the price and your strategy was run on each one. This checks whether its result depends on the exact sequence the market went through or holds in markets of a similar character.`
      )
    : shuffle
      ? t(
          `Se reordenaron tus ${summary.length} operaciones cerradas ${f.count.format(summary.runs)} veces. El resultado final es siempre el mismo; lo que cambia es la caída máxima, que depende de si las pérdidas llegan juntas o repartidas.`,
          `Your ${summary.length} closed trades were reordered ${f.count.format(summary.runs)} times. The final result is always the same; what changes is the maximum drawdown, which depends on whether the losses come together or spread out.`
        )
      : t(
          `Se construyeron ${f.count.format(summary.runs)} historias extrayendo al azar operaciones de tus ${summary.length} reales. Cada historia muestra lo que podría haber ocurrido con operaciones de calidad parecida pero en otra combinación.`,
          `${f.count.format(summary.runs)} histories were built by drawing trades at random from your ${summary.length} real ones. Each history shows what could have happened with trades of similar quality in another combination.`
        )
  const terms = [
    {
      term: t("Percentil", "Percentile"),
      text: t("P5 es el valor que solo empeoran 5 de cada 100 simulaciones; P95, el que solo superan 5 de cada 100.", "P5 is the value only 5 in 100 simulations do worse than; P95, the one only 5 in 100 beat."),
    },
    {
      term: t("Mediana", "Median"),
      text: t("El percentil 50: la mitad de las simulaciones termina por encima y la otra mitad por debajo.", "Percentile 50: half of the simulations end above it and half below."),
    },
    {
      term: t("Caída máxima", "Max drawdown"),
      text: t("La mayor bajada del capital desde un máximo anterior.", "The largest fall of the capital from a previous peak."),
      more: t("Una caída del 50 % exige ganar un 100 % para recuperar el capital: por eso las caídas grandes pesan tanto en la valoración.", "A 50 % drop needs a 100 % gain to recover the capital: that is why large drawdowns weigh so much in the assessment."),
    },
    {
      term: t("Semilla", "Seed"),
      text: t("Número que fija el azar de la simulación.", "A number that fixes the randomness of the simulation."),
      more: t("Con la misma semilla y los mismos ajustes se obtiene exactamente el mismo resultado, lo que permite repetir y comparar pruebas.", "With the same seed and settings you get exactly the same result, so tests can be repeated and compared."),
    },
  ]

  return (
    <>
      <McVerdict report={report} summary={summary} strategyName={run.strategy.name} />

      <Reveal label={t("Qué significan estas cifras", "What these figures mean")} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <h3 className="font-bold sm:col-span-2">{t("Qué significan estas cifras", "What these figures mean")}</h3>
        {shuffle ? (
          <>
            <Meaning big={`−${f.pct(stats.drawdownPct.p50, 0)}`} text={t("es la caída máxima habitual cuando tus operaciones llegan en otro orden.", "is the usual maximum drawdown when your trades arrive in another order.")} />
            <Meaning big={`−${f.pct(stats.drawdownPct.p95, 0)}`} text={t("es la caída que se superaría 1 de cada 20 veces, con un orden desfavorable.", "is the drawdown that would be exceeded 1 time in 20, with an unfavourable order.")} tone="bad" />
            <Meaning big={`−${f.pct(summary.real.maxDrawdownPct, 0)}`} text={t("fue la caída que se produjo realmente.", "was the drawdown that actually happened.")} />
            <Meaning big={`${Math.round(rankOf(summary.drawdowns, summary.real.maxDrawdownPct))} %`} text={t("de los órdenes habrían caído lo mismo o menos que el real.", "of the orders would have fallen as much as the real one or less.")} />
          </>
        ) : (
          <>
            <Meaning big={t(`${Math.round(stats.probProfit)} de cada 100`, `${Math.round(stats.probProfit)} in 100`)} text={t("historias terminan con beneficio.", "histories end with a profit.")} tone={stats.probProfit >= 50 ? "good" : "bad"} />
            <Meaning big={f.signedPct(stats.returnPct.p50)} text={t("es el resultado típico (la mitad termina por encima y la otra mitad por debajo).", "is the typical result (half end above it and half below).")} tone={tone(stats.returnPct.p50)} />
            <Meaning big={f.signedPct(stats.returnPct.p5)} text={t("o menos es lo que obtiene 1 de cada 20 historias. En ese 5 % más desfavorable el resultado medio es ", "or less is what 1 in 20 histories get. In that least favourable 5 % the average result is ") + f.signedPct(stats.worstTailPct, 0) + "."} tone={tone(stats.returnPct.p5)} />
            <Meaning big={`−${f.pct(stats.drawdownPct.p95, 0)}`} text={t("es la caída que superan 1 de cada 20 historias en algún momento.", "is the drawdown that 1 in 20 histories exceed at some point.")} tone="bad" />
            {paths && <Meaning big={t(`percentil ${Math.round(stats.realRank)}`, `percentile ${Math.round(stats.realRank)}`)} text={t(`es la posición de tu resultado real: superó al ${Math.round(stats.realRank)} % de los mercados simulados.`, `is the position of your real result: it beat ${Math.round(stats.realRank)} % of the simulated markets.`)} tone={stats.realRank > 90 ? "bad" : "good"} />}
            {paths && summary.beatHoldPct !== null && <Meaning big={`${Math.round(summary.beatHoldPct)} %`} text={t("de los mercados sintéticos, la estrategia superó a comprar y mantener.", "of the synthetic markets, the strategy beat buying and holding.")} tone={summary.beatHoldPct >= 50 ? "good" : "bad"} />}
          </>
        )}
      </Reveal>

      <ReadingPanel label={t("Cómo se calculó", "How it was calculated")} title={t("Cómo se calculó", "How it was calculated")} lines={[method]} terms={terms} />

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("Simulaciones", "Simulations")} value={f.count.format(summary.runs)} sub={paths ? t(`${f.count.format(summary.length)} velas cada una`, `${f.count.format(summary.length)} candles each`) : t(`${summary.length} operaciones cada una`, `${summary.length} trades each`)} />
        <StatTile label={t("Resultado real", "Real result")} value={f.signedPct(summary.real.returnPct)} sub={t("la única historia que ocurrió", "the only history that happened")} tone={tone(summary.real.returnPct)} />
        {!shuffle && <StatTile label={t("Media de las simulaciones", "Average of the simulations")} value={f.signedPct(stats.meanReturnPct)} tone={tone(stats.meanReturnPct)} sub={t("puede diferir de la mediana", "may differ from the median")} hint={t("Media aritmética de todos los resultados. Unas pocas simulaciones muy buenas o muy malas pueden desplazarla; la mediana es más representativa del caso típico.", "Arithmetic average of all results. A few very good or very bad simulations can shift it; the median is more representative of the typical case.")} />}
        {!shuffle && <StatTile label={t("Pierden más del 10 %", "Lose more than 10 %")} value={`${Math.round(stats.probLossTenth)} %`} sub={t("de las historias", "of the histories")} tone={stats.probLossTenth <= 10 ? "good" : stats.probLossTenth <= 25 ? "mixed" : "bad"} meter={stats.probLossTenth / 100} />}
        <StatTile label={t("Caídas de más del 50 %", "Drawdowns over 50 %")} value={`${f.decimal1.format(stats.probRuin)} %`} sub={t("de las historias", "of the histories")} tone={stats.probRuin <= 1 ? "good" : stats.probRuin <= 5 ? "mixed" : "bad"} meter={stats.probRuin / 100} hint={t("Porcentaje de simulaciones en las que el capital llega a perder la mitad o más desde un máximo. Recuperarse de algo así exige duplicar lo que queda.", "Share of simulations in which the capital loses half or more from a peak at some point. Recovering from that requires doubling what is left.")} />
        <StatTile label={t("Caída real", "Real drawdown")} value={`−${f.pct(summary.real.maxDrawdownPct)}`} sub={t("la que se produjo", "the one that happened")} />
        <StatTile label={t("Caída habitual", "Usual drawdown")} value={`−${f.pct(stats.drawdownPct.p50)}`} sub={t("la mediana de las simulaciones", "median of the simulations")} />
        <StatTile label={t("Caída en un caso desfavorable", "Drawdown in an unfavourable case")} value={`−${f.pct(stats.drawdownPct.p95)}`} sub={t("1 de cada 20 cae más", "1 in 20 falls more")} tone={stats.drawdownPct.p95 < DD_HIGH ? "good" : stats.drawdownPct.p95 < DD_SEVERE ? "mixed" : "bad"} />
      </dl>

      <section aria-label={t("Percentiles", "Percentiles")} className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-caption">
            <caption className="sr-only">{t("Percentiles de las simulaciones", "Percentiles of the simulations")}</caption>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("De cada 100 historias…", "Out of every 100 histories…")}</th>
                {[5, 25, 50, 75, 95].map((p) => (
                  <th key={p} className="num px-3 py-2 text-right font-semibold">
                    P{p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!shuffle && (
                <tr className="border-t">
                  <th className="px-3 py-2 text-left font-medium">{t("Rentabilidad final", "Final return")}</th>
                  {[stats.returnPct.p5, stats.returnPct.p25, stats.returnPct.p50, stats.returnPct.p75, stats.returnPct.p95].map((v, i) => (
                    <td key={i} className={cn("num px-3 py-2 text-right font-semibold", v > 0 ? "text-up" : v < 0 ? "text-down" : "")}>
                      {f.signedPct(v)}
                    </td>
                  ))}
                </tr>
              )}
              <tr className="border-t">
                <th className="px-3 py-2 text-left font-medium">{t("Caída máxima", "Maximum drawdown")}</th>
                {[stats.drawdownPct.p5, stats.drawdownPct.p25, stats.drawdownPct.p50, stats.drawdownPct.p75, stats.drawdownPct.p95].map((v, i) => (
                  <td key={i} className="num px-3 py-2 text-right">
                    −{f.pct(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">{t("P5 es el valor que superan 95 de cada 100 historias; P50 es la mediana; P95 solo lo superan 5 de cada 100.", "P5 is the value that 95 out of 100 histories exceed; P50 is the median; P95 is exceeded by only 5 out of 100.")}</p>
      </section>

      <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3 text-caption text-muted-foreground">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </>
  )
}

function Meaning({ big, text, tone }: { big: string; text: string; tone?: "good" | "bad" }) {
  return (
    <p className="flex items-baseline gap-3 rounded-lg bg-muted/40 p-3 text-caption text-muted-foreground">
      <strong className={cn("num shrink-0 text-title font-bold", tone === "good" ? "text-up" : tone === "bad" ? "text-down" : "text-foreground")}>{big}</strong>
      <span>{text}</span>
    </p>
  )
}
