"use client"

import { useMemo, useState } from "react"
import { LayersIcon } from "lucide-react"
import { cn } from "cn"
import { smoothRanks } from "@/lib/batch-report"
import type { TimeframesBatchRequest, TimeframesBatchResult } from "@/lib/backtests"
import { areaPath, clamp, extent, linePath, linear, niceTicks, pad } from "@/lib/chart-geometry"
import { formatDate } from "@/lib/format"
import { curveUpTo, curveValueAt, marksUpTo, tableCsv, timeframesExtra, timeframesReport, type Criterion } from "@/lib/robustness-report"
import { useReplayText } from "../replay/format"
import { STEPS, timeAt, timelineOf } from "../multi/multi-data"
import { RobustFrame, RobustVerdict, type RobustRun } from "./robust-frame"
import { downloadText } from "./download"
import { Spark } from "./spark"
import { ChartTip, Crosshair, Hint, HoverDot, TipRow, TipTitle, useChartHover } from "./hover"
import { glow, LegendRow, Narration, paint, ReadingPanel, signVar, spreadOut, StatTile, Tag, trianglePath, useSvgId, VizDefs, VizPanel } from "./viz"

type Run = TimeframesBatchRequest & Pick<RobustRun, "mode">
type Item = TimeframesBatchResult["items"][number]

const W = 1000
const L = 56
const R = 70
const EQ = { h: 330, top: 20, bottom: 30 }
const DD = { h: 150, top: 14, bottom: 26 }
// The timeframe asked for is the primary colour; the others take these in order.
const PALETTE = ["var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"]

/** Neighbouring or chosen timeframes: their equity curves drawing themselves over one another on one clock. */
export function TimeframesView({
  run,
  result,
  onClose,
  expanded,
  onExpandedChange,
}: {
  run: Run
  result: TimeframesBatchResult
  onClose: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const { locale, t, f } = useReplayText()
  const id = useSvgId()
  const timeline = useMemo(() => timelineOf(run.from, run.to), [run.from, run.to])
  const report = useMemo(() => timeframesReport(result, run.timeframe), [result, run.timeframe])
  const extra = useMemo(() => timeframesExtra(result), [result])
  const chosen = result.items.find((i) => i.timeframe === run.timeframe)
  // The timeframe whose orders are drawn (and whose line stands out); the chosen one by default.
  const [focusTf, setFocusTf] = useState(run.timeframe)
  const eqHover = useChartHover(W, EQ.h)
  const ddHover = useChartHover(W, DD.h)

  const curves = useMemo(() => {
    let others = 0
    return result.items.map((item) => {
      const isChosen = item.timeframe === run.timeframe
      return {
        item,
        isChosen,
        colour: isChosen ? "var(--primary)" : PALETTE[others++ % PALETTE.length],
        start: item.startsAt ? clamp((Date.parse(item.startsAt) - timeline.fromMs) / (timeline.toMs - timeline.fromMs)) : 0,
      }
    })
  }, [result.items, run.timeframe, timeline])

  const [lo, hi] = useMemo(() => {
    const all = [100, ...result.items.flatMap((i) => i.summary?.curve ?? []), ...(chosen?.summary?.benchmarkCurve ?? [])]
    return pad(extent(all), 0.08)
  }, [result.items, chosen])
  const maxDd = Math.max(5, ...result.items.map((i) => i.summary?.maxDrawdownPct ?? 0)) * 1.1
  const x = linear(0, 1, L, W - R)
  const y = linear(lo, hi, EQ.h - EQ.bottom, EQ.top)
  const yDd = linear(0, maxDd, DD.top, DD.h - DD.bottom)
  const ticks = niceTicks(lo, hi, 5)
  const ddTicks = niceTicks(0, maxDd, 3)

  /** Where, on the shared timeline, a curve is at progress `u` of it (late starters begin later). */
  const own = (start: number, u: number) => clamp((u - start) / (1 - start || 1))
  const px = (start: number, k: number, length: number) => x(start + (k / Math.max(1, length - 1)) * (1 - start))
  const draw = (curve: number[], start: number, u: number, scale: (v: number) => number) =>
    curveUpTo(curve, own(start, u)).map((v, k) => ({ x: px(start, k, curve.length), y: scale(v) }))
  const valueAt = (item: Item, start: number, u: number) => (item.summary && u >= start ? curveValueAt(item.summary.curve, own(start, u)) : null)
  const ddAt = (item: Item, start: number, u: number) => (item.summary && u >= start ? curveValueAt(item.summary.drawdownCurve, own(start, u)) : null)
  const ordersAt = (item: Item, start: number, u: number) => {
    if (!item.summary || u < start) return 0
    const m = marksUpTo(item.summary.marks, own(start, u))
    return m.buys + m.sells
  }

  const label = t("Reproducción de las temporalidades", "Timeframes replay")

  const csv = () => {
    const headers =
      locale === "es"
        ? ["Temporalidad", "Estrategia %", "Mantener %", "Caída máx. %", "Acierto %", "Sharpe", "Factor de beneficio", "Exposición %", "Operación media %", "Mejor operación %", "Peor operación %", "Capital final", "Órdenes", "Velas", "Primera vela"]
        : ["Timeframe", "Strategy %", "Hold %", "Max drawdown %", "Win rate %", "Sharpe", "Profit factor", "Exposure %", "Avg trade %", "Best trade %", "Worst trade %", "Final capital", "Orders", "Candles", "First candle"]
    const rows = result.items.map((i) => {
      const s = i.summary
      return [i.timeframe, s?.returnPct ?? null, s?.benchmarkReturnPct ?? null, s?.maxDrawdownPct ?? null, s?.winRatePct ?? null, s?.sharpe ?? null, s?.profitFactor ?? null, s?.exposurePct ?? null, s?.avgTradePct ?? null, s?.bestTradePct ?? null, s?.worstTradePct ?? null, s?.finalCapital ?? null, s?.orders ?? null, s?.candleCount ?? null, i.startsAt?.slice(0, 10) ?? ""]
    })
    downloadText(`backtestlab-timeframes-${run.symbol.toLowerCase()}-${run.from}_${run.to}.csv`, tableCsv(headers, rows, locale))
  }

  const format = (c: Criterion) => (c.value === null ? "—" : `${Math.round(c.value * 100)} %`)

  const ranItems = result.items.filter((i) => i.summary)
  const reading: string[] = []
  if (report.ran > 0) {
    reading.push(
      t(
        `Se ejecutó la misma estrategia, con el mismo activo y las mismas fechas, en ${report.ran} temporalidades (${ranItems.map((i) => i.timeframe).join(", ")}). Ganó dinero en ${report.profitable} y superó a comprar y mantener en ${report.beatsHold}.`,
        `The same strategy, asset and dates were run on ${report.ran} timeframes (${ranItems.map((i) => i.timeframe).join(", ")}). It made money on ${report.profitable} and beat buying and holding on ${report.beatsHold}.`
      )
    )
    if (report.chosenReturnPct !== null)
      reading.push(
        t(
          `En la temporalidad elegida (${run.timeframe}) obtuvo ${f.signedPct(report.chosenReturnPct)}; la más rentable fue ${report.bestTimeframe ?? "—"}${report.spreadPts === null ? "" : `, y entre la mejor y la peor hay ${f.decimal1.format(report.spreadPts)} puntos de diferencia`}.`,
          `On the chosen timeframe (${run.timeframe}) it made ${f.signedPct(report.chosenReturnPct)}; the most profitable was ${report.bestTimeframe ?? "—"}${report.spreadPts === null ? "" : `, and there are ${f.decimal1.format(report.spreadPts)} points between the best and the worst`}.`
        )
      )
    reading.push(
      report.headline === "consistent"
        ? t("Que funcione también en las temporalidades contiguas indica que la idea de la estrategia no depende de un tamaño de vela concreto.", "Working on the neighbouring timeframes too means the strategy's idea doesn't depend on one particular candle size.")
        : report.headline === "lonely"
          ? t("Solo gana la temporalidad elegida: es posible que el resultado se deba a una coincidencia de esa escala de tiempo y no a una ventaja real.", "Only the chosen timeframe wins: the result may be a coincidence of that time scale rather than a real edge.")
          : t("Los resultados cambian bastante de una temporalidad a otra, así que conviene no fiarse de una sola.", "The results change a lot from one timeframe to another, so it is wise not to rely on just one.")
    )
  }
  const terms = [
    {
      term: t("Temporalidad", "Timeframe"),
      text: t("Duración de cada vela: 1 hora, 4 horas, 1 día…", "The length of each candle: 1 hour, 4 hours, 1 day…"),
      more: t("La estrategia evalúa sus reglas al cierre de cada vela. Con velas más cortas reacciona antes, pero también recibe más señales falsas y paga más comisiones.", "The strategy checks its rules at each candle's close. Shorter candles react sooner but also get more false signals and pay more fees."),
    },
    {
      term: t("Caída desde máximos", "Drop from the peak"),
      text: t("Cuánto está el capital por debajo de su mejor valor anterior.", "How far the capital is below its previous best value."),
    },
    {
      term: t("Comprar y mantener", "Buy and hold"),
      text: t("Comprar el primer día y vender el último, sin operar.", "Buying on the first day and selling on the last, without trading."),
    },
    {
      term: "Sharpe",
      text: t("Rentabilidad obtenida por cada unidad de riesgo.", "Return earned per unit of risk."),
      more: t("Por encima de 1 se considera buena; por debajo de 0 la estrategia pierde dinero.", "Above 1 is considered good; below 0 the strategy loses money."),
    },
  ]

  const notes: string[] = []
  const failed = report.total - report.ran
  if (failed > 0)
    notes.push(
      t(
        `${f.plural(failed, "temporalidad no tenía", "temporalidades no tenían")} velas suficientes y no se ${failed === 1 ? "contó" : "contaron"}; su cupo se devolvió.`,
        `${failed} ${failed === 1 ? "timeframe didn't" : "timeframes didn't"} have enough candles and ${failed === 1 ? "wasn't" : "weren't"} counted; their quota was given back.`
      )
    )
  notes.push(
    t(
      "Cada temporalidad es un backtest completo del mismo rango; con menos velas (temporalidades mayores) hay menos operaciones y el resultado es más ruidoso.",
      "Each timeframe is a full backtest of the same range; with fewer candles (longer timeframes) there are fewer trades and the result is noisier."
    )
  )

  return (
    <RobustFrame
      run={{ ...run }}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      onClose={onClose}
      label={label}
      dateAt={(pos) => f.date.format(new Date(timeAt(timeline, pos)))}
      counterAt={() => t(`${report.ran} temporalidades`, `${report.ran} timeframes`)}
      onCsv={csv}
      animation={(pos, finished) => {
        const u = clamp(pos / STEPS)
        const hold = chosen?.summary?.benchmarkCurve ?? []
        const nowMs = timeAt(timeline, pos)
        const xNow = x(u)
        const live = curves.map(({ item, start }) => valueAt(item, start, u))
        const returns = live.map((v) => (v === null ? null : v - 100))
        const ranks = smoothRanks((p) => curves.map(({ item, start }) => {
          const v = valueAt(item, start, clamp(p / STEPS))
          return v === null ? null : v - 100
        }), pos, 8)
        const positive = returns.filter((r) => r !== null && r > 0).length
        const known = returns.filter((r): r is number => r !== null)
        const gap = known.length ? Math.max(...known) - Math.min(...known) : null
        const bestNow = known.length ? Math.max(...known) : null
        const labelYs = spreadOut(
          curves.map(({ item }, k) => (live[k] === null || !item.summary ? EQ.h : y(live[k]!))),
          17,
          EQ.top + 6,
          EQ.h - EQ.bottom - 4
        )
        const barScale = Math.max(5, ...result.items.map((i) => Math.abs(i.summary?.returnPct ?? 0)))

        const refHold = hold.length ? draw(hold, 0, u, y) : []
        const refCurve = curves.find((c) => c.item.timeframe === focusTf && c.item.summary) ?? curves.find((c) => c.isChosen && c.item.summary)
        const refPts = refCurve?.item.summary ? draw(refCurve.item.summary.curve, refCurve.start, u, y) : []
        const refMarks = refCurve?.item.summary?.marks ?? []
        const refOwn = refCurve ? own(refCurve.start, u) : 0
        const refColour = refCurve?.colour ?? "var(--primary)"
        // Reading under the pointer, once finished: every line at that moment.
        const readAt = (at: { x: number } | null) => (finished && at ? clamp((at.x - L) / (W - R - L)) : null)
        const eu = readAt(eqHover.at)
        const du = readAt(ddHover.at)
        const rowsAt = (q: number, read: (item: Item, start: number, q: number) => number | null) =>
          curves.flatMap(({ item, colour, start }) => {
            const v = read(item, start, q)
            return v === null ? [] : [{ tf: item.timeframe, colour, v }]
          })

        const narration = finished
          ? t(
              `Resultado: ${report.profitable} de ${report.ran} temporalidades ganaron dinero. Líneas que suben juntas = la estrategia no depende de una sola temporalidad.`,
              `Result: ${report.profitable} of ${report.ran} timeframes made money. Lines rising together = the strategy doesn't depend on a single timeframe.`
            )
          : t(
              `Mismo activo y mismas fechas, ${report.ran} temporalidades a la vez. Cada línea es un backtest completo; en ${f.date.format(new Date(nowMs))} ${positive} de ${known.length} van en positivo.`,
              `Same asset and dates, ${report.ran} timeframes at once. Each line is a full backtest; on ${f.date.format(new Date(nowMs))} ${positive} of ${known.length} are in profit.`
            )

        return (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_18.5rem]">
            <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
              <Narration icon={<LayersIcon className="text-primary" />}>{narration}</Narration>

              <VizPanel
                title={t("Capital de cada temporalidad", "Equity of each timeframe")}
                text={t("100 = el capital con el que empieza. Elige una temporalidad para ver sus compras (▲) y ventas (▼), dibujadas en su color.", "100 = the capital it starts with. Pick a timeframe to see its buys (▲) and sells (▼), drawn in its colour.")}
                hint={t(
                  "Cada línea es un backtest completo del mismo activo y las mismas fechas con una temporalidad distinta. Si las líneas suben juntas, la estrategia no depende de un tamaño de vela concreto. Las temporalidades mayores tienen menos velas y operan menos, así que sus resultados dependen de menos decisiones.",
                  "Each line is a full backtest of the same asset and dates on a different timeframe. If the lines rise together, the strategy doesn't depend on one candle size. Longer timeframes have fewer candles and trade less, so their results rest on fewer decisions."
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Temporalidad cuyas órdenes se muestran", "Timeframe whose orders are shown")}>
                  <span className="mr-1 text-[11px] text-muted-foreground">{t("Órdenes de:", "Orders of:")}</span>
                  {curves
                    .filter((cv) => cv.item.summary)
                    .map(({ item, colour, isChosen }) => {
                      const active = (refCurve?.item.timeframe ?? run.timeframe) === item.timeframe
                      return (
                        <button
                          key={item.timeframe}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setFocusTf(item.timeframe)}
                          className={cn(
                            "num inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
                            active ? "border-transparent text-background" : "bg-card text-foreground hover:bg-muted"
                          )}
                          style={active ? { background: colour } : undefined}
                        >
                          {!active && <span aria-hidden className="size-2 rounded-full" style={{ background: colour }} />}
                          {item.timeframe}
                          {isChosen && <span className={cn("text-[9px] uppercase", active ? "opacity-80" : "text-primary")}>{t("elegida", "chosen")}</span>}
                        </button>
                      )
                    })}
                </div>
                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${EQ.h}`} className="w-full touch-pan-y" role="img" aria-label={t("Curvas de capital por temporalidad", "Equity curves by timeframe")} {...eqHover.bind}>
                    <VizDefs id={id} />
                    {ticks.map((tick) => (
                      <g key={tick}>
                        <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke={tick === 100 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 100 ? undefined : "2 5"} opacity={tick === 100 ? 1 : 0.7} />
                        <text x={L - 8} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
                          {f.signedPct(tick - 100, 0)}
                        </text>
                      </g>
                    ))}
                    {[0, 0.25, 0.5, 0.75, 1].map((q) => (
                      <text key={q} x={x(q)} y={EQ.h - 8} textAnchor={q === 0 ? "start" : q === 1 ? "end" : "middle"} fontSize={10} fill="var(--muted-foreground)">
                        {f.axisDate.format(new Date(timeAt(timeline, q * STEPS)))}
                      </text>
                    ))}
                    {refPts.length > 1 && (
                      <defs>
                        <linearGradient id={`${id}-focus`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor={refColour} stopOpacity={0.26} />
                          <stop offset="1" stopColor={refColour} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    )}
                    {refPts.length > 1 && <path d={areaPath(refPts, y(100))} fill={`url(#${id}-focus)`} />}
                    {refHold.length > 1 && <path d={linePath(refHold)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.6} strokeDasharray="6 5" opacity={0.8} vectorEffect="non-scaling-stroke" />}
                    {curves
                      .filter((cv) => cv !== refCurve)
                      .map(({ item, colour, start }) => {
                        const pts = item.summary ? draw(item.summary.curve, start, u, y) : []
                        return pts.length > 1 ? <path key={item.timeframe} d={linePath(pts)} fill="none" stroke={colour} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} vectorEffect="non-scaling-stroke" /> : null
                      })}
                    {refPts.length > 1 && <path d={linePath(refPts)} fill="none" stroke={refColour} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" filter={glow(id)} />}
                    {refCurve?.item.summary &&
                      refMarks.map((mk, k) => {
                        if (mk.at > refOwn) return null
                        const length = refCurve.item.summary!.curve.length
                        const mx = px(refCurve.start, mk.at * (length - 1), length)
                        const my = y(curveValueAt(refCurve.item.summary!.curve, mk.at) ?? 100)
                        const age = (refOwn - mk.at) * STEPS
                        const size = 4.4 * (finished ? 1 : 0.4 + 0.6 * clamp(age / 6))
                        return <path key={k} d={trianglePath(mx, my + (mk.side === "buy" ? 11 : -11), size, mk.side === "buy")} fill={refColour} stroke="var(--card)" strokeWidth={1.4} />
                      })}
                    {!finished && <line x1={xNow} x2={xNow} y1={EQ.top - 6} y2={EQ.h - EQ.bottom} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 4" opacity={0.3} />}
                    {curves.map(({ item, colour, start }, k) => {
                      const v = live[k]
                      if (v === null || !item.summary) return null
                      const focused = refCurve?.item.timeframe === item.timeframe
                      const hx = px(start, own(start, u) * (item.summary.curve.length - 1), item.summary.curve.length)
                      return (
                        <g key={item.timeframe}>
                          {eu === null && <circle cx={hx} cy={y(v)} r={focused ? 5.5 : 4} fill={colour} stroke="var(--card)" strokeWidth={2.2} filter={focused ? glow(id) : undefined} />}
                          <Tag x={W - R + 6} y={labelYs[k]} anchor="start" text={`${item.timeframe} ${f.signedPct(v - 100, 0)}`} colour={colour} size={10} />
                        </g>
                      )
                    })}
                    {eu !== null && (
                      <>
                        <Crosshair x={x(eu)} top={EQ.top} bottom={EQ.h - EQ.bottom} />
                        {rowsAt(eu, valueAt).map((row) => (
                          <HoverDot key={row.tf} x={x(eu)} y={y(row.v)} colour={row.colour} r={row.tf === refCurve?.item.timeframe ? 5 : 3.8} />
                        ))}
                      </>
                    )}
                  </svg>
                  {eu !== null && (
                    <ChartTip x={x(eu)} y={EQ.top + 40} width={W} height={EQ.h}>
                      <TipTitle>{f.date.format(new Date(timeAt(timeline, eu * STEPS)))}</TipTitle>
                      {rowsAt(eu, valueAt)
                        .sort((p1, p2) => p2.v - p1.v)
                        .map((row) => (
                          <TipRow key={row.tf} label={row.tf + (row.tf === run.timeframe ? ` · ${t("elegida", "chosen")}` : "")} value={f.signedPct(row.v - 100)} colour={row.colour} valueColour={signVar(row.v - 100)} strong={row.tf === refCurve?.item.timeframe} />
                        ))}
                      {hold.length > 0 && <TipRow label={t("Comprar y mantener", "Buy and hold")} value={f.signedPct((curveValueAt(hold, eu) ?? 100) - 100)} colour="var(--muted-foreground)" dashed />}
                    </ChartTip>
                  )}
                </div>
                <LegendRow
                  items={[
                    { label: t(`Órdenes de ${refCurve?.item.timeframe ?? run.timeframe}: ▲ compra · ▼ venta`, `Orders of ${refCurve?.item.timeframe ?? run.timeframe}: ▲ buy · ▼ sell`), colour: refColour, dot: true },
                    { label: t("Comprar y mantener", "Buy and hold"), colour: "var(--muted-foreground)", dashed: true },
                  ]}
                />
              </VizPanel>

              <VizPanel title={t("Caída desde máximos", "Drop from the peak")} text={t("Cuánto cae el capital desde su mejor momento: cuanto menos, mejor.", "How far the capital falls from its best moment: the less, the better.")}>
                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${DD.h}`} className="w-full touch-pan-y" role="img" aria-label={t("Caída desde máximos por temporalidad", "Drawdown by timeframe")} {...ddHover.bind}>
                    <VizDefs id={`${id}d`} />
                    {ddTicks.map((tick) => (
                      <g key={tick}>
                        <line x1={L} x2={W - R} y1={yDd(tick)} y2={yDd(tick)} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "2 5"} opacity={0.8} />
                        <text x={L - 8} y={yDd(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
                          {tick === 0 ? "0" : `−${f.pct(tick, 0)}`}
                        </text>
                      </g>
                    ))}
                    {refCurve?.item.summary && (() => {
                      const pts = draw(refCurve.item.summary.drawdownCurve, refCurve.start, u, yDd)
                      return pts.length > 1 ? <path d={areaPath(pts, yDd(0))} fill={paint(`${id}d`, "down-flip")} /> : null
                    })()}
                    {curves.map(({ item, colour, start }) => {
                      const focused = refCurve?.item.timeframe === item.timeframe
                      const pts = item.summary ? draw(item.summary.drawdownCurve, start, u, yDd) : []
                      return pts.length > 1 ? <path key={item.timeframe} d={linePath(pts)} fill="none" stroke={colour} strokeWidth={focused ? 2.6 : 1.5} opacity={focused ? 1 : 0.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null
                    })}
                    {!finished && <line x1={xNow} x2={xNow} y1={DD.top} y2={DD.h - DD.bottom} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 4" opacity={0.3} />}
                    {du !== null && (
                      <>
                        <Crosshair x={x(du)} top={DD.top} bottom={DD.h - DD.bottom} />
                        {rowsAt(du, ddAt).map((row) => (
                          <HoverDot key={row.tf} x={x(du)} y={yDd(row.v)} colour={row.colour} r={3.6} />
                        ))}
                      </>
                    )}
                  </svg>
                  {du !== null && (
                    <ChartTip x={x(du)} y={DD.h / 2} width={W} height={DD.h}>
                      <TipTitle>{f.date.format(new Date(timeAt(timeline, du * STEPS)))}</TipTitle>
                      {rowsAt(du, ddAt)
                        .sort((p1, p2) => p1.v - p2.v)
                        .map((row) => (
                          <TipRow key={row.tf} label={row.tf} value={row.v > 0 ? `−${f.pct(row.v)}` : "0 %"} colour={row.colour} />
                        ))}
                    </ChartTip>
                  )}
                </div>
              </VizPanel>
            </div>

            <aside className="flex flex-col gap-3 border-t p-3 sm:p-4 lg:border-t-0 lg:border-l">
              <h3 className="font-bold">{t("Ranking en vivo", "Live ranking")}</h3>
              <ol className="relative" style={{ height: curves.length * 58 }} aria-label={t("Rentabilidad actual por temporalidad", "Current return by timeframe")}>
                {curves.map(({ item, colour, isChosen, start }, k) => {
                  const r = returns[k]
                  const dd = ddAt(item, start, u)
                  return (
                    <li
                      key={item.timeframe}
                      className={cn(
                        "absolute inset-x-0 top-0 flex cursor-pointer flex-col justify-center gap-1 rounded-lg border px-2.5 transition-colors hover:bg-muted/50",
                        refCurve?.item.timeframe === item.timeframe ? "bg-accent/50" : isChosen ? "border-primary/60 bg-card" : "bg-card"
                      )}
                      style={{ height: 52, transform: `translateY(${ranks[k] * 58}px)`, borderColor: refCurve?.item.timeframe === item.timeframe ? colour : undefined }}
                      onClick={() => item.summary && setFocusTf(item.timeframe)}
                      title={t("Mostrar sus órdenes en el gráfico", "Show its orders on the chart")}
                    >
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: colour }} />
                        <span className="num font-bold">{item.timeframe}</span>
                        {isChosen && <span className="text-[9px] font-bold text-primary uppercase">{t("elegida", "chosen")}</span>}
                        <span className="num ml-auto font-bold" style={{ color: signVar(r) }}>
                          {item.summary ? (r === null ? "—" : f.signedPct(r)) : t("sin velas", "no candles")}
                        </span>
                      </div>
                      {item.summary && (
                        <>
                          <div className="relative h-1.5 rounded-full bg-muted">
                            {r !== null && (
                              <span className="absolute inset-y-0 rounded-full" style={{ left: r >= 0 ? "50%" : `${50 - (Math.abs(r) / barScale) * 50}%`, width: `${(Math.min(Math.abs(r), barScale) / barScale) * 50}%`, background: signVar(r) }} />
                            )}
                            <span aria-hidden className="absolute inset-y-[-2px] left-1/2 w-px bg-border-strong" />
                          </div>
                          <p className="num flex justify-between text-[10px] text-muted-foreground">
                            <span>{t(`${ordersAt(item, start, u)} órdenes`, `${ordersAt(item, start, u)} orders`)}</span>
                            <span>{dd === null ? "—" : `${t("caída", "drop")} −${f.pct(dd, 1)}`}</span>
                          </p>
                        </>
                      )}
                    </li>
                  )
                })}
              </ol>
              <dl className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <StatTile label={t("En positivo ahora", "In profit now")} value={`${positive} / ${known.length}`} tone={known.length === 0 ? undefined : positive / known.length >= 0.8 ? "good" : positive / known.length >= 0.5 ? "mixed" : "bad"} meter={known.length ? positive / known.length : 0} />
                <StatTile label={t("La mejor ahora", "Best right now")} value={bestNow === null ? "—" : f.signedPct(bestNow)} sub={bestNow === null ? undefined : curves[returns.indexOf(bestNow)]?.item.timeframe} />
                <StatTile label={t("Diferencia entre la mejor y la peor", "Gap between best and worst")} value={gap === null ? "—" : `${f.decimal1.format(gap)} pts`} />
              </dl>
              {finished && <p className="text-[11px] text-muted-foreground">{t("Pulsa R para repetir.", "Press R to replay.")}</p>}
            </aside>
          </div>
        )
      }}
      results={
        <>
          <RobustVerdict report={report} strategyName={run.strategy.name} format={format} notes={notes} />
          <ReadingPanel label={t("Lectura de los resultados", "Reading the results")} title={t("Lectura de los resultados", "Reading the results")} lines={reading} terms={terms} />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label={t(`En ${run.timeframe} (elegida)`, `On ${run.timeframe} (chosen)`)} value={report.chosenReturnPct === null ? "—" : f.signedPct(report.chosenReturnPct)} tone={report.chosenReturnPct === null ? undefined : report.chosenReturnPct > 0 ? "good" : "bad"} />
            <StatTile label={t("Mejor temporalidad", "Best timeframe")} value={report.bestTimeframe ?? "—"} sub={t("por rentabilidad", "by return")} />
            <StatTile label={t("Rentables", "Profitable")} value={`${report.profitable} / ${report.ran}`} tone={report.ran === 0 ? undefined : report.profitable / report.ran >= 0.8 ? "good" : report.profitable / report.ran >= 0.5 ? "mixed" : "bad"} meter={report.ran ? report.profitable / report.ran : 0} />
            <StatTile label={t("Diferencia entre la mejor y la peor", "Gap between best and worst")} value={report.spreadPts === null ? "—" : `${f.decimal1.format(report.spreadPts)} pts`} sub={t("cuanto menor, más estable", "the smaller, the steadier")} hint={t("Puntos porcentuales entre la temporalidad más rentable y la menos rentable. Una diferencia pequeña indica que el resultado no depende de la temporalidad.", "Percentage points between the most and the least profitable timeframe. A small gap means the result doesn't depend on the timeframe.")} />
            <StatTile label={t("Mejor Sharpe", "Best Sharpe")} value={extra.bestSharpe ?? "—"} sub={t("rentabilidad por riesgo", "return per unit of risk")} hint={t("Temporalidad con la mejor relación entre rentabilidad y variabilidad del capital.", "Timeframe with the best balance between return and how much the capital swings.")} />
            <StatTile label={t("Menor caída", "Shallowest drop")} value={extra.lowestDrawdown ?? "—"} sub={t("la más tranquila", "the calmest one")} />
            <StatTile label={t("Más operativa", "Most active")} value={extra.mostOrders ?? "—"} sub={t("más órdenes", "most orders")} />
            <StatTile label={t("Elegida frente a mantener", "Chosen against holding")} value={chosen?.summary ? f.pts(chosen.summary.returnPct - chosen.summary.benchmarkReturnPct) : "—"} tone={chosen?.summary ? (chosen.summary.returnPct > chosen.summary.benchmarkReturnPct ? "good" : "bad") : undefined} hint={t("Puntos que la temporalidad elegida ganó (o perdió) frente a comprar al inicio y conservar hasta el final.", "Points the chosen timeframe made (or lost) against buying at the start and holding to the end.")} />
          </dl>
          <Comparison result={result} chosen={run.timeframe} />
          <TimeframesTable result={result} chosen={run.timeframe} />
        </>
      }
    />
  )
}

/** Return, buy and hold and drawdown of each timeframe side by side. */
function Comparison({ result, chosen }: { result: TimeframesBatchResult; chosen: string }) {
  const { t, f } = useReplayText()
  const id = useSvgId()
  const [hover, setHover] = useState<number | null>(null)
  const ran = result.items.filter((i): i is Item & { summary: NonNullable<Item["summary"]> } => i.summary !== null)
  const H = 240
  const T = 24
  const B = 40
  const [lo, hi] = pad(extent([0, ...ran.flatMap((i) => [i.summary.returnPct, i.summary.benchmarkReturnPct, -i.summary.maxDrawdownPct])]), 0.12)
  const y = linear(lo, hi, H - B, T)
  const ticks = niceTicks(lo, hi, 5)
  const slot = (W - 70) / Math.max(1, ran.length)
  if (ran.length === 0) return null
  return (
    <section aria-label={t("Comparación de temporalidades", "Timeframe comparison")} className="rounded-xl border bg-card p-4">
      <h3 className="mb-1 flex items-center gap-1.5 font-bold">
        {t("Comparación lado a lado", "Side by side")}
        <Hint title={t("Cómo leer este gráfico", "How to read this chart")}>
          {t(
            "Para cada temporalidad: lo que ganó la estrategia, lo que habría ganado comprar y mantener, y su mayor caída desde un máximo. Lo deseable es una barra de estrategia alta con una caída corta.",
            "For each timeframe: what the strategy made, what buying and holding would have made, and its largest fall from a peak. What you want is a tall strategy bar with a short drop."
          )}
        </Hint>
      </h3>
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onPointerLeave={() => setHover(null)}>
        <VizDefs id={id} />
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={50} x2={W - 20} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 0 ? undefined : "2 5"} />
            <text x={44} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
              {f.pct(tick, 0)}
            </text>
          </g>
        ))}
        {ran.map((item, k) => {
          const cx = 50 + slot * (k + 0.5)
          const bw = Math.min(26, slot / 4.2)
          const s = item.summary
          const bar = (dx: number, v: number, fill: string) => <rect x={cx + dx - bw / 2} y={Math.min(y(0), y(v))} width={bw} height={Math.max(1.5, Math.abs(y(v) - y(0)))} rx={3} fill={fill} />
          return (
            <g key={item.timeframe} opacity={hover === null || hover === k ? 1 : 0.4} onPointerEnter={() => setHover(k)}>
              {hover === k && <rect x={cx - slot / 2 + 4} y={T - 10} width={slot - 8} height={H - B - T + 34} rx={10} fill="var(--primary)" opacity={0.07} />}
              {bar(-bw * 1.1, s.returnPct, s.returnPct >= 0 ? "var(--up)" : "var(--down)")}
              {bar(0, s.benchmarkReturnPct, "var(--muted-foreground)")}
              {bar(bw * 1.1, -s.maxDrawdownPct, "color-mix(in oklab, var(--down) 45%, transparent)")}
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
              <text x={cx} y={H - 18} textAnchor="middle" fontSize={12} fontWeight={item.timeframe === chosen ? 800 : 600} fill={item.timeframe === chosen ? "var(--primary)" : "var(--foreground)"} className="num">
                {item.timeframe}
              </text>
            </g>
          )
        })}
      </svg>
      {hover !== null && ran[hover] && (
        <ChartTip x={50 + slot * (hover + 0.5) + slot * 0.25} y={y(ran[hover].summary.returnPct)} width={W} height={H}>
          <TipTitle>
            {ran[hover].timeframe}
            {ran[hover].timeframe === chosen ? ` · ${t("elegida", "chosen")}` : ""}
          </TipTitle>
          <TipRow label={t("Estrategia", "Strategy")} value={f.signedPct(ran[hover].summary.returnPct)} valueColour={signVar(ran[hover].summary.returnPct)} strong />
          <TipRow label={t("Comprar y mantener", "Buy and hold")} value={f.signedPct(ran[hover].summary.benchmarkReturnPct)} />
          <TipRow label={t("Caída máxima", "Max drawdown")} value={`−${f.pct(ran[hover].summary.maxDrawdownPct)}`} />
          <TipRow label={t("Órdenes", "Orders")} value={String(ran[hover].summary.orders)} />
          <TipRow label="Sharpe" value={f.ratio.format(ran[hover].summary.sharpe)} />
        </ChartTip>
      )}
      </div>
      <LegendRow
        items={[
          { label: t("Estrategia", "Strategy"), colour: "var(--up)", dot: true },
          { label: t("Comprar y mantener", "Buy and hold"), colour: "var(--muted-foreground)", dot: true },
          { label: t("Caída máxima", "Max drawdown"), colour: "color-mix(in oklab, var(--down) 45%, transparent)", dot: true },
        ]}
      />
    </section>
  )
}

function TimeframesTable({ result, chosen }: { result: TimeframesBatchResult; chosen: string }) {
  const { locale, t, f } = useReplayText()
  const toneOf = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "")
  return (
    <section aria-label={t("Detalle por temporalidad", "Detail by timeframe")} className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] text-left text-caption">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">{t("Temporalidad", "Timeframe")}</th>
              <th className="px-3 py-2 font-semibold">{t("Curva", "Curve")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Estrategia", "Strategy")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Mantener", "Hold")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Caída máx.", "Max drawdown")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Acierto", "Win rate")}</th>
              <th className="px-3 py-2 text-right font-semibold">Sharpe</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Fact. benef.", "Profit f.")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Operación media", "Avg trade")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("En mercado", "In market")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Órdenes", "Orders")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Velas", "Candles")}</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => {
              const s = item.summary
              return (
                <tr key={item.timeframe} className={cn("border-t", item.timeframe === chosen && "bg-accent/40")}>
                  <td className="num px-3 py-2 font-semibold">
                    {item.timeframe}
                    {item.timeframe === chosen && <span className="ml-2 text-[10px] font-semibold text-primary uppercase">{t("elegida", "chosen")}</span>}
                  </td>
                  {s ? (
                    <>
                      <td className="px-3 py-1.5">
                        <Spark curve={s.curve} hold={s.benchmarkCurve} width={92} height={26} />
                      </td>
                      <td className={cn("num px-3 py-2 text-right font-semibold", toneOf(s.returnPct))}>{f.signedPct(s.returnPct)}</td>
                      <td className={cn("num px-3 py-2 text-right", toneOf(s.benchmarkReturnPct))}>{f.signedPct(s.benchmarkReturnPct)}</td>
                      <td className="num px-3 py-2 text-right">−{f.pct(s.maxDrawdownPct)}</td>
                      <td className="num px-3 py-2 text-right">{s.roundTrips ? f.pct(s.winRatePct, 0) : "—"}</td>
                      <td className="num px-3 py-2 text-right">{f.ratio.format(s.sharpe)}</td>
                      <td className="num px-3 py-2 text-right">{s.profitFactor === null ? "—" : f.ratio.format(s.profitFactor)}</td>
                      <td className={cn("num px-3 py-2 text-right", s.avgTradePct !== null && toneOf(s.avgTradePct))}>{s.avgTradePct === null ? "—" : f.signedPct(s.avgTradePct)}</td>
                      <td className="num px-3 py-2 text-right">{f.pct(s.exposurePct, 0)}</td>
                      <td className="num px-3 py-2 text-right">{s.orders}</td>
                      <td className="num px-3 py-2 text-right">
                        {f.count.format(s.candleCount)}
                        {item.startsAt && Date.parse(item.startsAt) - Date.parse(result.items[0].startsAt ?? item.startsAt) > 86_400_000 && <span className="ml-1 text-muted-foreground">({formatDate(item.startsAt, locale)})</span>}
                      </td>
                    </>
                  ) : (
                    <td colSpan={11} className="px-3 py-2 text-right text-muted-foreground">
                      {t("Sin velas suficientes en el rango", "Not enough candles in the range")}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
