"use client"

import { useMemo, useState } from "react"
import { RotateCcwIcon } from "lucide-react"
import { cn } from "cn"
import type { RunSummary, WindowsBatchRequest, WindowsBatchResult } from "@/lib/backtests"
import { areaPath, clamp, easeOutBack, easeOutCubic, extent, linePath, linear, niceTicks, pad, phase } from "@/lib/chart-geometry"
import { formatDate } from "@/lib/format"
import { curveUpTo, curveValueAt, fanOf, marksUpTo, resample, tableCsv, windowLanes, windowsExtra, windowsReport, type Criterion } from "@/lib/robustness-report"
import { useReplayText } from "../replay/format"
import { STEPS } from "../multi/multi-data"
import { RobustFrame, RobustVerdict, type RobustRun } from "./robust-frame"
import { downloadText } from "./download"
import { ChartTip, Crosshair, HoverDot, indexAtX, TipRow, TipTitle, useChartHover } from "./hover"
import { Spark } from "./spark"
import { glow, LegendRow, Narration, paint, Pulse, ReadingPanel, Ring, signVar, StatTile, Tag, trianglePath, useSvgId, VizDefs, VizPanel } from "./viz"

type Run = WindowsBatchRequest & Pick<RobustRun, "mode">
type Item = WindowsBatchResult["items"][number]
type Ran = { index: number; item: Item; s: RunSummary }

const W = 1000
const X0 = 30
const X1 = W - 30
const DAY_MS = 86_400_000
/** The windows play one after another until here; then the focus chart turns into the fan of all of them. */
const SEQ_END = STEPS * 0.88
const FAN_FROM = 0.9
/** Share of each window's turn spent drawing it (the rest shows its result). */
const RUN_SHARE = 0.8

const curveAt = (curve: number[], at: number) => curveValueAt(curve, at) ?? 100

/** Rolling windows: the strategy restarted on each slice, one window after another, each starting from zero. */
export function WindowsView({
  run,
  result,
  onClose,
  expanded,
  onExpandedChange,
}: {
  run: Run
  result: WindowsBatchResult
  onClose: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const { locale, t, f } = useReplayText()
  const id = useSvgId()
  const capital = run.strategy.initialCapital
  const fromMs = Date.parse(run.from)
  const toMs = Date.parse(run.to) + DAY_MS
  const report = useMemo(() => windowsReport(result), [result])
  const extra = useMemo(() => windowsExtra(result), [result])
  const lanes = useMemo(() => windowLanes(result.items), [result])
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1))
  const xOf = (ms: number) => X0 + clamp((ms - fromMs) / (toMs - fromMs)) * (X1 - X0)
  const n = result.items.length
  // The window under the pointer and the chart it is in: every chart highlights it, only that one shows its card.
  const [hoverState, setHoverState] = useState<{ i: number; from: "lanes" | "steps" | "bars" | "table" } | null>(null)
  const hoverWin = hoverState?.i ?? null
  const hoverAt = (i: number, from: "lanes" | "steps" | "bars" | "table") => setHoverState({ i, from })
  const clearHover = () => setHoverState(null)

  const ran = useMemo<Ran[]>(() => result.items.flatMap((item, index) => (item.summary ? [{ index, item, s: item.summary }] : [])), [result.items])
  const order = useMemo(() => new Map(ran.map((r, k) => [r.index, k])), [ran])
  const fan = useMemo(() => fanOf(ran.map((r) => r.s.curve)), [ran])
  const m = ran.length

  // --- The schedule: each window gets the same share of the replay, one after another.
  const slot = SEQ_END / Math.max(1, m)
  const run_ = slot * RUN_SHARE
  const doneAt = (k: number) => k * slot + run_
  const turnAt = (pos: number) => {
    if (m === 0) return { k: -1, p: 0, local: 0 }
    const k = Math.min(m - 1, Math.floor(clamp(pos, 0, SEQ_END - 1e-6) / slot))
    const local = pos - k * slot
    return { k, p: clamp(local / run_), local }
  }
  const startMs = (item: Item) => Date.parse(item.start)
  const endMs = (item: Item) => Date.parse(item.end) + DAY_MS

  // --- Geometry: timeline (price + windows), stepper, focus/fan chart and returns.
  const prices = useMemo(() => result.prices.map((p) => ({ t: Date.parse(p.time), close: p.close })), [result.prices])
  const [pLo, pHi] = useMemo(() => pad(extent(prices.map((p) => p.close)), 0.08), [prices])
  const PRICE_TOP = 26
  const PRICE_BOTTOM = 138
  const yPrice = linear(pLo, pHi, PRICE_BOTTOM, PRICE_TOP)
  const priceXY = prices.map((p) => ({ x: xOf(p.t), y: yPrice(p.close), t: p.t }))
  const priceYAt = (ms: number) => {
    let k = 0
    while (k < prices.length - 1 && prices[k + 1].t <= ms) k++
    return priceXY[k]?.y ?? PRICE_BOTTOM
  }
  const LANE_TOP = PRICE_BOTTOM + 20
  const LANE_H = clamp(110 / laneCount - 3, 3, 12)
  const LANE_STEP = LANE_H + 3
  const TIMELINE_H = LANE_TOP + laneCount * LANE_STEP + 10

  const STEP_H = 42
  const gap = n > 40 ? 2 : 4
  const pillW = Math.min(54, (X1 - X0 - gap * (n - 1)) / Math.max(1, n))
  const rowW = n * pillW + gap * (n - 1)
  const pillX = (i: number) => X0 + (X1 - X0 - rowW) / 2 + i * (pillW + gap)

  const FOCUS_H = 260
  const FX0 = X0 + 40
  const FX1 = X1 - 6
  const F_TOP = 36
  const F_BOTTOM = FOCUS_H - 30
  const [cLo, cHi] = useMemo(() => pad(extent([100, ...ran.flatMap((r) => [...r.s.curve, ...r.s.benchmarkCurve])]), 0.06), [ran])
  const yCurve = linear(cLo, cHi, F_BOTTOM, F_TOP)
  const xCurve = (at: number) => FX0 + clamp(at) * (FX1 - FX0)
  const curveTicks = niceTicks(cLo, cHi, 5)
  const fanHover = useChartHover(W, FOCUS_H)

  const COL_H = 210
  const C_TOP = 22
  const C_BOTTOM = COL_H - 30
  const values = ran.flatMap((r) => [r.s.returnPct, r.s.benchmarkReturnPct, 0])
  const [rLo, rHi] = pad(extent(values), 0.12)
  const yRet = linear(rLo, rHi, C_BOTTOM, C_TOP)
  const retTicks = niceTicks(rLo, rHi, 4)
  const colSlot = (X1 - X0) / Math.max(1, n)
  const barW = Math.max(3, Math.min(40, colSlot * 0.66))

  const live = (pos: number) => {
    const done = ran.filter((_, k) => pos >= doneAt(k))
    const returns = done.map((r) => r.s.returnPct).sort((a, b) => a - b)
    const mid = returns.length >> 1
    return {
      done: done.length,
      positive: done.filter((r) => r.s.returnPct > 0).length,
      median: returns.length ? (returns.length % 2 ? returns[mid] : (returns[mid - 1] + returns[mid]) / 2) : null,
      worst: returns[0] ?? null,
      best: returns.at(-1) ?? null,
      drawdown: done.length ? done.reduce((sum, r) => sum + r.s.maxDrawdownPct, 0) / done.length : null,
    }
  }

  const label = t("Reproducción de las ventanas móviles", "Rolling windows replay")
  const short = (ms: number) => f.axisDate.format(new Date(ms))
  const cursorMs = (pos: number) => {
    const { k, p } = turnAt(pos)
    if (k < 0) return fromMs
    const item = ran[k].item
    return startMs(item) + p * (endMs(item) - startMs(item))
  }

  const csv = () => {
    const headers =
      locale === "es"
        ? ["Desde", "Hasta", "Estrategia %", "Mantener %", "Diferencia pts", "Caída máx. %", "Acierto %", "Sharpe", "Factor de beneficio", "Exposición %", "Órdenes"]
        : ["From", "To", "Strategy %", "Hold %", "Difference pts", "Max drawdown %", "Win rate %", "Sharpe", "Profit factor", "Exposure %", "Orders"]
    const rows = ran.map(({ item, s }) => [item.start, item.end, s.returnPct, s.benchmarkReturnPct, s.returnPct - s.benchmarkReturnPct, s.maxDrawdownPct, s.winRatePct, s.sharpe, s.profitFactor, s.exposurePct, s.orders])
    downloadText(`backtestlab-windows-${run.symbol.toLowerCase()}-${run.timeframe}-${run.from}_${run.to}.csv`, tableCsv(headers, rows, locale))
  }

  const format = (c: Criterion) => {
    if (c.value === null) return "—"
    if (c.id === "positive" || c.id === "beats") return `${Math.round(c.value * 100)} %`
    if (c.id === "drawdown") return `−${f.pct(c.value)}`
    return f.signedPct(c.value)
  }

  const notes: string[] = []
  const failed = report.total - report.ran
  if (failed > 0)
    notes.push(
      t(
        `${f.plural(failed, "ventana no tenía", "ventanas no tenían")} velas del activo (aún no cotizaba) y no se ${failed === 1 ? "contó" : "contaron"}; su cupo se devolvió.`,
        `${failed} ${failed === 1 ? "window had" : "windows had"} no candles of the asset (it wasn't listed yet) and ${failed === 1 ? "wasn't" : "weren't"} counted; their quota was given back.`
      )
    )
  notes.push(
    t(
      "Cada ventana reinicia la estrategia con el capital completo y empieza sin posición; los indicadores sí usan las velas anteriores para estar calentados.",
      "Each window restarts the strategy with the full capital and no position; the indicators do use the previous candles so they are warmed up."
    )
  )

  // --- Reading of the results
  const pctOf = (v: number) => `${Math.round(v * 100)} %`
  const reading: string[] = []
  if (report.ran > 0) {
    reading.push(
      t(
        `El rango se dividió en ${report.ran} ventanas de ${result.lengthDays} días, que empiezan cada ${result.stepDays} días. En cada una la estrategia arranca de cero con el capital completo, como si alguien hubiera empezado a usarla ese día.`,
        `The range was split into ${report.ran} windows of ${result.lengthDays} days, starting every ${result.stepDays} days. In each one the strategy starts from scratch with the full capital, as if someone had started using it that day.`
      )
    )
    reading.push(
      t(
        `Ganó dinero en ${report.positive} de ${report.ran} ventanas (${pctOf(report.positive / report.ran)}) y superó a comprar y mantener en ${report.beatsHold}. La rentabilidad típica por ventana (mediana) fue ${report.medianReturnPct === null ? "—" : f.signedPct(report.medianReturnPct)}.`,
        `It made money in ${report.positive} of ${report.ran} windows (${pctOf(report.positive / report.ran)}) and beat buying and holding in ${report.beatsHold}. The typical return per window (median) was ${report.medianReturnPct === null ? "—" : f.signedPct(report.medianReturnPct)}.`
      )
    )
    if (report.best && report.worst) {
      const b = result.items[report.best.index]
      const w = result.items[report.worst.index]
      reading.push(
        t(
          `La mejor ventana (${formatDate(b.start, locale)} → ${formatDate(b.end, locale)}) terminó en ${f.signedPct(report.best.returnPct)} y la peor (${formatDate(w.start, locale)} → ${formatDate(w.end, locale)}) en ${f.signedPct(report.worst.returnPct)}. La racha más larga sin beneficio fue de ${extra.losingStreak} ${extra.losingStreak === 1 ? "ventana" : "ventanas seguidas"}${extra.losingStreak >= 3 ? ", un periodo que exigiría paciencia para no abandonar la estrategia" : ""}.`,
          `The best window (${formatDate(b.start, locale)} → ${formatDate(b.end, locale)}) ended at ${f.signedPct(report.best.returnPct)} and the worst (${formatDate(w.start, locale)} → ${formatDate(w.end, locale)}) at ${f.signedPct(report.worst.returnPct)}. The longest stretch without profit was ${extra.losingStreak} ${extra.losingStreak === 1 ? "window" : "windows in a row"}${extra.losingStreak >= 3 ? ", a period that would take patience not to abandon the strategy" : ""}.`
        )
      )
    }
    if (result.stepDays < result.lengthDays)
      reading.push(
        t(
          "Las ventanas se solapan (cada una dura más de lo que tarda en empezar la siguiente), así que un mismo tramo del mercado aparece en varias de ellas.",
          "The windows overlap (each lasts longer than the gap to the next one), so the same stretch of the market appears in several of them."
        )
      )
  }
  const terms = [
    {
      term: t("Ventana", "Window"),
      text: t("Un periodo independiente en el que se reinicia la estrategia.", "An independent period in which the strategy restarts."),
      more: t("Empieza sin posición abierta y con el capital inicial, de modo que lo ganado o perdido en una ventana no afecta a las demás.", "It starts with no open position and the initial capital, so what is won or lost in one window doesn't affect the others."),
    },
    {
      term: t("Mediana", "Median"),
      text: t("El valor central: la mitad de las ventanas queda por encima y la otra mitad por debajo.", "The middle value: half of the windows are above it and half below."),
    },
    {
      term: t("Dispersión", "Spread"),
      text: t("Cuánto se separan los resultados de su media, en puntos porcentuales.", "How far the results are from their average, in percentage points."),
      more: t("Una dispersión alta significa que el resultado depende mucho del momento en que se empiece.", "A high spread means the result depends heavily on when you start."),
    },
    {
      term: t("Racha sin ganar", "Dry run"),
      text: t("Ventanas consecutivas que terminaron sin beneficio.", "Consecutive windows that ended without profit."),
    },
  ]

  /** Card with one window's figures, for the hover of the timeline, the stepper and the bars. */
  const windowTip = (index: number, x: number, y: number, width: number, height: number) => {
    const item = result.items[index]
    const s = item.summary
    return (
      <ChartTip x={x} y={y} width={width} height={height}>
        <TipTitle>
          {t("Ventana", "Window")} {index + 1}: {short(startMs(item))} → {short(Date.parse(item.end))}
        </TipTitle>
        {s ? (
          <>
            <Spark curve={s.curve} hold={s.benchmarkCurve} width={150} height={32} className="my-0.5" />
            <TipRow label={t("Estrategia", "Strategy")} value={f.signedPct(s.returnPct)} valueColour={signVar(s.returnPct)} strong />
            <TipRow label={t("Comprar y mantener", "Buy and hold")} value={f.signedPct(s.benchmarkReturnPct)} />
            <TipRow label={t("Diferencia", "Difference")} value={f.pts(s.returnPct - s.benchmarkReturnPct)} valueColour={signVar(s.returnPct - s.benchmarkReturnPct)} />
            <TipRow label={t("Caída máxima", "Max drawdown")} value={`−${f.pct(s.maxDrawdownPct)}`} />
            <TipRow label={t("Órdenes", "Orders")} value={String(s.orders)} />
          </>
        ) : (
          <p className="text-muted-foreground">{t("Sin velas del activo en este tramo.", "No candles of the asset in this stretch.")}</p>
        )}
      </ChartTip>
    )
  }

  return (
    <RobustFrame
      run={{ ...run }}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      onClose={onClose}
      label={label}
      dateAt={(pos) => f.date.format(new Date(cursorMs(pos)))}
      counterAt={(pos) => {
        const { k } = turnAt(pos)
        return pos >= SEQ_END ? t(`${m} ventanas`, `${m} windows`) : t(`Ventana ${k + 1} de ${m}`, `Window ${k + 1} of ${m}`)
      }}
      onCsv={csv}
      animation={(pos, finished) => {
        const lv = live(pos)
        const { k, p, local } = turnAt(pos)
        const fanMix = easeOutCubic(phase(pos, FAN_FROM * STEPS, (1 - FAN_FROM) * STEPS))
        const playing = !finished && fanMix < 0.5 && k >= 0
        const focus = k >= 0 ? ran[k] : undefined
        const nowMs = cursorMs(pos)
        const xNow = xOf(nowMs)
        const hover = finished ? hoverWin : null

        const focusPts = focus ? curveUpTo(focus.s.curve, p).map((v, i) => ({ x: xCurve(i / Math.max(1, focus.s.curve.length - 1)), y: yCurve(v), v })) : []
        if (focus && p < 1 && focusPts.length > 1) focusPts[focusPts.length - 1].x = xCurve(p)
        const holdPts = focus ? curveUpTo(focus.s.benchmarkCurve, p).map((v, i) => ({ x: xCurve(i / Math.max(1, focus.s.benchmarkCurve.length - 1)), y: yCurve(v) })) : []
        if (focus && p < 1 && holdPts.length > 1) holdPts[holdPts.length - 1].x = xCurve(p)
        const focusHead = focusPts.at(-1)
        const focusRet = focusHead ? focusHead.v - 100 : 0
        const focusMarks = focus ? marksUpTo(focus.s.marks, p) : { buys: 0, sells: 0 }
        const ordersDone = focusMarks.buys + focusMarks.sells
        const ended = p >= 1
        const focusColour = ended ? signVar(focus?.s.returnPct ?? 0) : "var(--primary)"
        const sinceEnd = local - run_
        const trail = focusPts.slice(Math.max(0, focusPts.length - 6))
        const curvePts = (curve: number[]) => resample(curve, 48).map((v, i) => ({ x: xCurve(i / 47), y: yCurve(v) }))
        const medianPts = fan.median.map((v, i) => ({ x: xCurve(i / Math.max(1, fan.median.length - 1)), y: yCurve(v) }))
        const bandTop = fan.upper.map((v, i) => ({ x: xCurve(i / Math.max(1, fan.upper.length - 1)), y: yCurve(v) }))
        const bandBottom = fan.lower.map((v, i) => ({ x: xCurve(i / Math.max(1, fan.lower.length - 1)), y: yCurve(v) }))
        const fk = finished && fanHover.at ? indexAtX(fanHover.at.x, FX0, FX1, 48) : null
        const fx = fk === null ? 0 : xCurve(fk / 47)

        let narration: React.ReactNode
        if (finished || fanMix > 0.6)
          narration = t(
            `Resultado: la estrategia ganó dinero en ${lv.positive} de ${report.ran} ventanas. Cada línea es una ventana que empieza desde 100; la gruesa es la mediana. Pasa el ratón por los gráficos para ver cada ventana.`,
            `Result: the strategy made money in ${lv.positive} of ${report.ran} windows. Each line is a window starting from 100; the thick one is the median. Hover over the charts to see each window.`
          )
        else if (focus)
          narration = t(
            `Ventana ${k + 1} de ${m} (${short(startMs(focus.item))} → ${short(Date.parse(focus.item.end))}): la estrategia empieza de cero con ${f.usdt(capital)} y sin posición. ${ended ? `Terminó con ${f.signedPct(focus.s.returnPct)}.` : `Ahora ${focusRet >= 0 ? "gana" : "pierde"} ${f.pct(Math.abs(focusRet))}.`}`,
            `Window ${k + 1} of ${m} (${short(startMs(focus.item))} → ${short(Date.parse(focus.item.end))}): the strategy starts from scratch with ${f.usdt(capital)} and no position. ${ended ? `It ended at ${f.signedPct(focus.s.returnPct)}.` : `It is ${focusRet >= 0 ? "up" : "down"} ${f.pct(Math.abs(focusRet))} now.`}`
          )
        else narration = null

        const isDone = (index: number) => {
          const at = order.get(index)
          return at !== undefined && pos >= doneAt(at)
        }

        return (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
              <Narration icon={<RotateCcwIcon className="text-primary" />}>{narration}</Narration>

              <VizPanel
                title={t("1 · El rango se corta en ventanas", "1 · The range is cut into windows")}
                text={t("Cada barra es un periodo independiente. La zona iluminada es la ventana que se está calculando.", "Each bar is an independent period. The lit area is the window being calculated.")}
              >
                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${TIMELINE_H}`} className="w-full" role="img" aria-label={t("Precio y ventanas sobre la línea de tiempo", "Price and windows over the timeline")} onPointerLeave={clearHover}>
                    <VizDefs id={id} />
                    {niceTicks(pLo, pHi, 3).map((tick) => (
                      <line key={tick} x1={X0} x2={X1} y1={yPrice(tick)} y2={yPrice(tick)} stroke="var(--border)" strokeDasharray="2 5" opacity={0.6} />
                    ))}
                    <path d={areaPath(priceXY, PRICE_BOTTOM)} fill={paint(id, "ink")} opacity={0.55} />
                    <path d={linePath(priceXY)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} opacity={0.45} vectorEffect="non-scaling-stroke" />

                    {/* The window being calculated: a lit area with a moving border */}
                    {playing && focus && (() => {
                      const x1 = xOf(startMs(focus.item))
                      const x2 = xOf(endMs(focus.item))
                      const inside = priceXY.filter((q) => q.t >= startMs(focus.item) && q.t <= nowMs)
                      const enter = easeOutCubic(phase(local, 0, 8))
                      return (
                        <g>
                          <rect x={x1} y={PRICE_TOP - 12} width={Math.max(2, x2 - x1)} height={TIMELINE_H - PRICE_TOP + 6} rx={7} fill={paint(id, "primary")} opacity={0.9 * enter} />
                          <rect x={x1} y={PRICE_TOP - 12} width={Math.max(2, x2 - x1)} height={TIMELINE_H - PRICE_TOP + 6} rx={7} fill="none" stroke="var(--primary)" strokeWidth={1.6} strokeDasharray="6 5" strokeDashoffset={-pos * 2} opacity={0.9 * enter} />
                          {inside.length > 1 && <path d={areaPath(inside, PRICE_BOTTOM)} fill={paint(id, "primary")} />}
                          {inside.length > 1 && <path d={linePath(inside)} fill="none" stroke="var(--primary)" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" filter={glow(id)} />}
                          <line x1={xNow} x2={xNow} y1={PRICE_TOP - 12} y2={TIMELINE_H - 6} stroke="var(--primary)" strokeWidth={1.4} opacity={0.85} />
                          <circle cx={xNow} cy={priceYAt(nowMs)} r={5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2.5} filter={glow(id)} />
                          <Tag x={clamp((x1 + x2) / 2, X0 + 60, X1 - 60)} y={10} text={`${t("Ventana", "Window")} ${focus.index + 1} · ${Math.round(p * 100)} %`} colour="var(--primary)" size={10} />
                        </g>
                      )
                    })()}

                    {result.items.map((item, i) => {
                      const x1 = xOf(startMs(item))
                      const x2 = xOf(endMs(item))
                      const y = LANE_TOP + lanes[i] * LANE_STEP
                      const at = order.get(i)
                      const current = playing && at === k
                      const done = item.summary && isDone(i)
                      const fill = done ? signVar(item.summary!.returnPct) : "var(--primary)"
                      const pr = current ? p : done ? 1 : 0
                      const lit = hover === i
                      return (
                        <g key={`lane-${item.start}`} onPointerEnter={() => hoverAt(i, "lanes")} className={finished ? "cursor-default" : undefined}>
                          <rect x={x1} y={y} width={Math.max(2, x2 - x1)} height={LANE_H} rx={Math.min(5, LANE_H / 2)} fill="var(--muted)" opacity={item.summary ? 0.55 : 0.2} stroke={lit ? "var(--foreground)" : current ? "var(--primary)" : "var(--border-strong)"} strokeWidth={lit || current ? 1.5 : 1} strokeDasharray={item.summary ? undefined : "3 3"} />
                          {item.summary && pr > 0 && <rect x={x1} y={y} width={Math.max(2, (x2 - x1) * pr)} height={LANE_H} rx={Math.min(5, LANE_H / 2)} fill={fill} opacity={done ? (hover === null || lit ? 0.95 : 0.45) : 0.85} filter={current ? glow(id) : undefined} />}
                          {LANE_H >= 9 && x2 - x1 > 22 && item.summary && pr > 0.15 && (
                            <text x={x1 + 7} y={y + LANE_H / 2 + 3.5} fontSize={9.5} fontWeight={700} fill="var(--background)" className="num" pointerEvents="none">
                              {i + 1}
                            </text>
                          )}
                          {finished && <rect x={x1} y={y - 1.5} width={Math.max(2, x2 - x1)} height={LANE_STEP} fill="transparent" />}
                        </g>
                      )
                    })}

                    {ran.map(({ item, s }, at) => {
                      const age = pos - doneAt(at)
                      if (age < 0) return null
                      const x = xOf(endMs(item))
                      const y = priceYAt(endMs(item))
                      const grow = easeOutBack(phase(age, 0, 9))
                      return (
                        <g key={`dot-${item.start}`} pointerEvents="none">
                          <Pulse x={x} y={y} age={age} colour={signVar(s.returnPct)} to={28} />
                          <circle cx={x} cy={y} r={4.5 * grow} fill={signVar(s.returnPct)} stroke="var(--card)" strokeWidth={2} />
                        </g>
                      )
                    })}
                  </svg>
                  {hover !== null && hoverState?.from === "lanes" && windowTip(hover, (xOf(startMs(result.items[hover])) + xOf(endMs(result.items[hover]))) / 2, LANE_TOP + lanes[hover] * LANE_STEP, W, TIMELINE_H)}
                </div>
              </VizPanel>

              <VizPanel
                title={fanMix > 0.5 ? t("2 · Todas las ventanas, cada una desde 100", "2 · Every window, each from 100") : focus ? t(`2 · Ventana ${k + 1} de ${m}`, `2 · Window ${k + 1} of ${m}`) : t("2 · Cada ventana empieza de cero", "2 · Each window starts from scratch")}
                text={
                  fanMix > 0.5
                    ? t("Si las líneas están muy abiertas, el resultado depende de cuándo se empiece.", "Widely spread lines mean the result depends on when you start.")
                    : focus
                      ? t(`${formatDate(focus.item.start, locale)} → ${formatDate(focus.item.end, locale)} · capital de la ventana (100 = su capital inicial) frente a comprar y mantener.`, `${formatDate(focus.item.start, locale)} → ${formatDate(focus.item.end, locale)} · window equity (100 = its starting capital) against buy and hold.`)
                      : undefined
                }
              >
                {/* Stepper: every window, the current one lit */}
                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${STEP_H}`} className="w-full" role="img" aria-label={t("Orden de las ventanas", "Order of the windows")} onPointerLeave={clearHover}>
                    {result.items.map((item, i) => {
                      const at = order.get(i)
                      const current = playing && at === k
                      const done = item.summary && isDone(i)
                      const x = pillX(i)
                      const lift = current ? 3 * (1 - easeOutCubic(phase(local, 0, 10))) : 0
                      const y = 14 - lift
                      const lit = hover === i
                      return (
                        <g key={item.start} onPointerEnter={() => hoverAt(i, "steps")}>
                          <rect x={x} y={y} width={pillW} height={20} rx={Math.min(7, pillW / 2)} fill={done ? signVar(item.summary!.returnPct) : "var(--muted)"} opacity={done ? (hover === null || lit ? 0.9 : 0.4) : item.summary ? 0.8 : 0.35} stroke={lit ? "var(--foreground)" : current ? "var(--primary)" : "none"} strokeWidth={1.6} strokeDasharray={item.summary ? undefined : "3 2"} />
                          {current && <rect x={x} y={y} width={pillW * p} height={20} rx={Math.min(7, pillW / 2)} fill="var(--primary)" filter={glow(id)} />}
                          {pillW >= 16 && (
                            <text x={x + pillW / 2} y={y + 13.5} textAnchor="middle" fontSize={10} fontWeight={700} className="num" fill={done || current ? "var(--background)" : "var(--muted-foreground)"} pointerEvents="none">
                              {i + 1}
                            </text>
                          )}
                          {current && <path d={trianglePath(x + pillW / 2, 5, 4, false)} fill="var(--primary)" />}
                        </g>
                      )
                    })}
                  </svg>
                  {hover !== null && hoverState?.from === "steps" && windowTip(hover, pillX(hover) + pillW / 2, 24, W, STEP_H)}
                </div>

                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${FOCUS_H}`} className="w-full touch-pan-y" role="img" aria-label={t("Capital de la ventana en curso", "Equity of the current window")} {...fanHover.bind}>
                    <VizDefs id={`${id}f`} />
                    {curveTicks.map((tick) => (
                      <g key={tick}>
                        <line x1={FX0} x2={FX1} y1={yCurve(tick)} y2={yCurve(tick)} stroke={tick === 100 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 100 ? undefined : "2 5"} opacity={tick === 100 ? 1 : 0.7} />
                        <text x={FX0 - 8} y={yCurve(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
                          {f.signedPct(tick - 100, 0)}
                        </text>
                      </g>
                    ))}
                    <text x={FX0} y={FOCUS_H - 8} fontSize={10} fill="var(--muted-foreground)">
                      {t("inicio de la ventana", "window start")}
                    </text>
                    <text x={FX1} y={FOCUS_H - 8} fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
                      {t("fin de la ventana", "window end")}
                    </text>

                    {/* What finished windows leave behind */}
                    <g opacity={1 - fanMix}>
                      {ran.map((r, at) =>
                        pos >= doneAt(at) && at !== k ? <path key={r.item.start} d={linePath(curvePts(r.s.curve))} fill="none" stroke={signVar(r.s.returnPct)} strokeWidth={1.2} opacity={0.2} vectorEffect="non-scaling-stroke" /> : null
                      )}
                    </g>

                    {/* The window in progress */}
                    {focus && (
                      <g opacity={1 - fanMix}>
                        {local < 16 && !finished && (
                          <g pointerEvents="none">
                            <line x1={FX0} x2={FX0} y1={F_TOP} y2={F_BOTTOM} stroke="var(--primary)" strokeWidth={3} opacity={1 - local / 16} filter={glow(`${id}f`)} />
                            <Pulse x={FX0} y={yCurve(100)} age={local + 0.01} span={16} colour="var(--primary)" from={4} to={34} />
                          </g>
                        )}
                        {local < 26 && !finished && (
                          <g opacity={1 - phase(local, 16, 10)}>
                            <Tag x={FX0 + 96} y={F_TOP - 14} text={`↺ ${t("reinicio", "restart")} · ${f.usdt(capital)}`} colour="var(--primary)" size={10} />
                          </g>
                        )}
                        {holdPts.length > 1 && <path d={linePath(holdPts)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.8} vectorEffect="non-scaling-stroke" />}
                        {focusPts.length > 1 && (
                          <>
                            <path d={areaPath(focusPts, yCurve(100))} fill={ended ? paint(`${id}f`, focus.s.returnPct >= 0 ? "up" : "down") : paint(`${id}f`, "primary")} />
                            <path d={linePath(focusPts)} fill="none" stroke={focusColour} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                            {!ended && trail.length > 1 && <path d={linePath(trail)} fill="none" stroke={focusColour} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={0.3} filter={glow(`${id}f`)} />}
                          </>
                        )}
                        {focus.s.marks.map((mk, i) =>
                          mk.at <= p ? (
                            <path key={i} d={trianglePath(xCurve(mk.at), yCurve(curveAt(focus.s.curve, mk.at)) + (mk.side === "buy" ? 11 : -11), 3.8 * easeOutBack(clamp((p - mk.at) * 30)), mk.side === "buy")} fill={mk.side === "buy" ? "var(--up)" : "var(--down)"} stroke="var(--card)" strokeWidth={1} opacity={0.95} />
                          ) : null
                        )}
                        {focusHead && !ended && (
                          <>
                            <circle cx={focusHead.x} cy={focusHead.y} r={5.5} fill={focusColour} stroke="var(--card)" strokeWidth={2.5} filter={glow(`${id}f`)} />
                            <Tag x={clamp(focusHead.x, FX0 + 40, FX1 - 40)} y={clamp(focusHead.y - 20, F_TOP - 12, F_BOTTOM)} text={f.signedPct(focusRet)} colour={signVar(focusRet)} />
                          </>
                        )}
                        {focusHead && ended && !finished && (
                          <g>
                            <Pulse x={focusHead.x} y={focusHead.y} age={sinceEnd + 0.01} span={20} colour={focusColour} from={5} to={30} />
                            <circle cx={focusHead.x} cy={focusHead.y} r={6} fill={focusColour} stroke="var(--card)" strokeWidth={2.5} />
                            <Tag x={clamp(focusHead.x - 70, FX0 + 60, FX1 - 70)} y={clamp(focusHead.y - 22, F_TOP - 12, F_BOTTOM)} text={`${t("final", "final")} ${f.signedPct(focus.s.returnPct)}`} colour={focusColour} size={10 + 2 * easeOutBack(phase(sinceEnd, 0, 8))} />
                          </g>
                        )}
                        {!finished && (
                          <text x={FX1} y={18} textAnchor="end" fontSize={11} fill="var(--muted-foreground)" className="num">
                            {t(`${ordersDone} órdenes`, `${ordersDone} orders`)} · {t("caída", "drawdown")} −{f.pct(curveAt(focus.s.drawdownCurve, p), 1)}
                          </text>
                        )}
                      </g>
                    )}

                    {/* The fan of all of them */}
                    <g opacity={fanMix}>
                      {ran.map((r) => (
                        <path key={r.item.start} d={linePath(curvePts(r.s.curve))} fill="none" stroke={signVar(r.s.returnPct)} strokeWidth={hover === r.index ? 2.8 : 1.4} opacity={hover === null ? 0.4 : hover === r.index ? 1 : 0.15} vectorEffect="non-scaling-stroke" />
                      ))}
                      {bandTop.length > 1 && <path d={`${linePath(bandTop)}${[...bandBottom].reverse().map((q) => `L${q.x} ${q.y}`).join("")}Z`} fill="var(--primary)" opacity={0.14} />}
                      {medianPts.length > 1 && <path d={linePath(medianPts)} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" filter={glow(`${id}f`)} />}
                      {medianPts.length > 1 && fk === null && <Tag x={FX1 - 52} y={clamp(medianPts.at(-1)!.y - 18, F_TOP - 12, F_BOTTOM)} text={`${t("mediana", "median")} ${f.signedPct((fan.median.at(-1) ?? 100) - 100)}`} colour="var(--primary)" size={10} />}
                    </g>
                    {fk !== null && fan.median.length > 0 && (
                      <>
                        <Crosshair x={fx} top={F_TOP} bottom={F_BOTTOM} />
                        <HoverDot x={fx} y={yCurve(fan.upper[fk])} colour="var(--primary)" r={3} />
                        <HoverDot x={fx} y={yCurve(fan.lower[fk])} colour="var(--primary)" r={3} />
                        <HoverDot x={fx} y={yCurve(fan.median[fk])} colour="var(--primary)" />
                      </>
                    )}
                  </svg>
                  {fk !== null && fan.median.length > 0 && (
                    <ChartTip x={fx} y={yCurve(fan.median[fk])} width={W} height={FOCUS_H}>
                      <TipTitle>{t(`${Math.round((fk / 47) * 100)} % de la ventana`, `${Math.round((fk / 47) * 100)} % into the window`)}</TipTitle>
                      <TipRow label={t("Cuartil superior", "Upper quartile")} value={f.signedPct(fan.upper[fk] - 100)} />
                      <TipRow label={t("Mediana", "Median")} value={f.signedPct(fan.median[fk] - 100)} colour="var(--primary)" valueColour={signVar(fan.median[fk] - 100)} strong />
                      <TipRow label={t("Cuartil inferior", "Lower quartile")} value={f.signedPct(fan.lower[fk] - 100)} />
                      <p className="text-[10px] text-muted-foreground">{t("La mitad de las ventanas está entre los dos cuartiles.", "Half of the windows sit between the two quartiles.")}</p>
                    </ChartTip>
                  )}
                </div>
                {fanMix > 0.5 && (
                  <LegendRow
                    items={[
                      { label: t("Ventana que ganó", "Winning window"), colour: "var(--up)" },
                      { label: t("Ventana que perdió", "Losing window"), colour: "var(--down)" },
                      { label: t("Mediana y rango central (25-75 %)", "Median and central range (25-75 %)"), colour: "var(--primary)" },
                    ]}
                  />
                )}
              </VizPanel>

              <VizPanel title={t("3 · Cómo acabó cada una", "3 · How each one ended")} text={t("Barra: estrategia. Raya: comprar y mantener en ese mismo tramo.", "Bar: strategy. Tick: buying and holding over the same stretch.")}>
                <div className="relative">
                  <svg viewBox={`0 0 ${W} ${COL_H}`} className="w-full" role="img" aria-label={t("Rentabilidad de cada ventana", "Return of each window")} onPointerLeave={clearHover}>
                    <VizDefs id={`${id}c`} />
                    {retTicks.map((tick) => (
                      <g key={tick}>
                        <line x1={X0} x2={X1} y1={yRet(tick)} y2={yRet(tick)} stroke={tick === 0 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 0 ? undefined : "2 5"} opacity={tick === 0 ? 1 : 0.7} />
                        <text x={X0 + 2} y={yRet(tick) - 4} fontSize={10} fill="var(--muted-foreground)" className="num">
                          {f.pct(tick + 0, 0)}
                        </text>
                      </g>
                    ))}
                    {lv.median !== null && lv.done >= 2 && (
                      <g pointerEvents="none">
                        <line x1={X0} x2={X1} y1={yRet(lv.median)} y2={yRet(lv.median)} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="6 5" opacity={0.85} />
                        <Tag x={X1 - 62} y={yRet(lv.median) - 13} text={`${t("mediana", "median")} ${f.signedPct(lv.median)}`} colour="var(--primary)" size={10} />
                      </g>
                    )}
                    {playing && focus && (
                      <g pointerEvents="none">
                        <rect x={X0 + colSlot * focus.index + 1} y={C_TOP - 8} width={colSlot - 2} height={C_BOTTOM - C_TOP + 16} rx={6} fill="var(--primary)" opacity={0.08} />
                        {!ended && (
                          <rect
                            x={X0 + colSlot * (focus.index + 0.5) - barW / 2}
                            y={Math.min(yRet(0), yRet(focusRet))}
                            width={barW}
                            height={Math.max(1.5, Math.abs(yRet(focusRet) - yRet(0)))}
                            rx={Math.min(4, barW / 2)}
                            fill="none"
                            stroke="var(--primary)"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                          />
                        )}
                      </g>
                    )}
                    {ran.map(({ item, index, s }, at) => {
                      const age = pos - doneAt(at)
                      const grow = easeOutBack(phase(age, 0, 14))
                      if (age < 0 || grow <= 0) return null
                      const cx = X0 + colSlot * (index + 0.5)
                      const y0 = yRet(0)
                      const y1 = yRet(s.returnPct * grow)
                      const up = s.returnPct >= 0
                      const dim = hover !== null && hover !== index
                      return (
                        <g key={item.start} opacity={dim ? 0.4 : 1} onPointerEnter={() => hoverAt(index, "bars")}>
                          <rect x={cx - barW / 2} y={Math.min(y0, y1)} width={barW} height={Math.max(1.5, Math.abs(y1 - y0))} rx={Math.min(4, barW / 2)} fill={paint(`${id}c`, up ? "up" : "down")} stroke={signVar(s.returnPct)} strokeWidth={hover === index ? 2.4 : 1.6} />
                          <line x1={cx - barW / 2 - 2} x2={cx + barW / 2 + 2} y1={yRet(s.benchmarkReturnPct * grow)} y2={yRet(s.benchmarkReturnPct * grow)} stroke="var(--foreground)" strokeWidth={2.2} strokeLinecap="round" opacity={0.7} />
                          <Pulse x={cx} y={y1} age={age} colour={signVar(s.returnPct)} to={20} />
                          {(n <= 14 || age < 40) && age > 4 && (
                            <text x={cx} y={up ? y1 - 7 : y1 + 15} textAnchor="middle" fontSize={10} fontWeight={700} fill={signVar(s.returnPct)} className="num" opacity={phase(age, 4, 8)} pointerEvents="none">
                              {f.signedPct(s.returnPct, 0)}
                            </text>
                          )}
                          {finished && <rect x={X0 + colSlot * index} y={C_TOP - 8} width={colSlot} height={C_BOTTOM - C_TOP + 16} fill="transparent" />}
                        </g>
                      )
                    })}
                    {result.items.map((_, i) =>
                      n <= 16 || i % Math.ceil(n / 16) === 0 ? (
                        <text key={i} x={X0 + colSlot * (i + 0.5)} y={COL_H - 10} textAnchor="middle" fontSize={10} fontWeight={playing && focus?.index === i ? 800 : 400} fill={playing && focus?.index === i ? "var(--primary)" : "var(--muted-foreground)"} className="num">
                          {i + 1}
                        </text>
                      ) : null
                    )}
                  </svg>
                  {hover !== null && hoverState?.from === "bars" && result.items[hover].summary && windowTip(hover, X0 + colSlot * (hover + 0.5), yRet(result.items[hover].summary!.returnPct), W, COL_H)}
                </div>
              </VizPanel>
            </div>

            <aside className="flex flex-col gap-3 border-t p-3 sm:p-4 lg:border-t-0 lg:border-l">
              {playing && focus ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-primary/40 bg-accent/40 p-3">
                  <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">{t("Ventana en curso", "Current window")}</p>
                  <p className="num text-heading leading-none font-bold">
                    {k + 1}
                    <span className="text-caption font-medium text-muted-foreground"> / {m}</span>
                  </p>
                  <p className="num text-caption text-muted-foreground">
                    {formatDate(focus.item.start, locale)} → {formatDate(focus.item.end, locale)}
                  </p>
                  <span className="relative h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${p * 100}%` }} />
                  </span>
                  <p className="num flex justify-between text-caption">
                    <span className="font-bold" style={{ color: signVar(ended ? focus.s.returnPct : focusRet) }}>
                      {f.signedPct(ended ? focus.s.returnPct : focusRet)}
                    </span>
                    <span className="text-muted-foreground">{t(`${ordersDone} órdenes`, `${ordersDone} orders`)}</span>
                  </p>
                </div>
              ) : (
                <h3 className="font-bold">{t("Resumen", "Summary")}</h3>
              )}
              <div className="flex items-center gap-3">
                <Ring value={lv.done ? lv.positive / lv.done : 0} tone={lv.done === 0 ? "mixed" : lv.positive / lv.done >= 0.7 ? "good" : lv.positive / lv.done >= 0.5 ? "mixed" : "bad"} label={t("Ventanas rentables", "Profitable windows")}>
                  <span className="text-title">{lv.done ? `${Math.round((lv.positive / lv.done) * 100)}%` : "—"}</span>
                  <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">{t("rentables", "profitable")}</span>
                </Ring>
                <p className="num text-caption text-muted-foreground">
                  {lv.done ? t(`${lv.positive} de ${lv.done} ventanas terminadas ganaron.`, `${lv.positive} of ${lv.done} finished windows made money.`) : t("Aún no ha terminado ninguna.", "None has finished yet.")}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <StatTile label={t("Ventanas terminadas", "Finished windows")} value={`${lv.done} / ${report.ran}`} meter={report.ran ? lv.done / report.ran : 0} />
                <StatTile label={t("Mediana", "Median")} value={lv.median === null ? "—" : f.signedPct(lv.median)} tone={lv.median === null ? undefined : lv.median > 0 ? "good" : "bad"} />
                <StatTile label={t("Mejor hasta ahora", "Best so far")} value={lv.best === null ? "—" : f.signedPct(lv.best)} tone={lv.best === null ? undefined : lv.best > 0 ? "good" : "bad"} />
                <StatTile label={t("Peor hasta ahora", "Worst so far")} value={lv.worst === null ? "—" : f.signedPct(lv.worst)} tone={lv.worst === null ? undefined : lv.worst >= 0 ? "good" : "bad"} />
                <StatTile label={t("Caída media", "Average drawdown")} value={lv.drawdown === null ? "—" : `−${f.pct(lv.drawdown)}`} />
              </dl>
              {finished && <p className="text-[11px] text-muted-foreground">{t("Pasa el ratón por las barras o la tira numerada para ver cada ventana. Pulsa R para repetir.", "Hover over the bars or the numbered strip to see each window. Press R to replay.")}</p>}
            </aside>
          </div>
        )
      }}
      results={
        <>
          <RobustVerdict report={report} strategyName={run.strategy.name} format={format} notes={notes} />
          <ReadingPanel label={t("Lectura de los resultados", "Reading the results")} title={t("Lectura de los resultados", "Reading the results")} lines={reading} terms={terms} />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label={t("Mediana por ventana", "Median per window")} value={report.medianReturnPct === null ? "—" : f.signedPct(report.medianReturnPct)} sub={t("el caso típico", "the typical case")} tone={report.medianReturnPct === null ? undefined : report.medianReturnPct > 0 ? "good" : "bad"} hint={t("Rentabilidad central de las ventanas: la mitad obtuvo más y la otra mitad menos.", "The middle return of the windows: half made more and half made less.")} />
            <StatTile label={t("Mejor ventana", "Best window")} value={report.best ? f.signedPct(report.best.returnPct) : "—"} sub={report.best ? formatDate(result.items[report.best.index].start, locale) : undefined} tone="good" />
            <StatTile label={t("Peor ventana", "Worst window")} value={report.worst ? f.signedPct(report.worst.returnPct) : "—"} sub={report.worst ? formatDate(result.items[report.worst.index].start, locale) : undefined} tone={report.worst && report.worst.returnPct >= 0 ? "good" : "bad"} hint={t("Lo que habría obtenido quien empezara a usar la estrategia en el momento más desfavorable del rango.", "What someone who started using the strategy at the least favourable moment of the range would have got.")} />
            <StatTile label={t("Mayor caída en una ventana", "Deepest drop in a window")} value={report.worstDrawdownPct === null ? "—" : `−${f.pct(report.worstDrawdownPct)}`} hint={t("La mayor bajada del capital desde un máximo dentro de cualquier ventana.", "The largest fall of the capital from a peak inside any window.")} />
            <StatTile label={t("Media de las ventanas", "Average of the windows")} value={extra.meanReturnPct === null ? "—" : f.signedPct(extra.meanReturnPct)} sub={extra.stdevReturnPct === null ? undefined : t(`dispersión ±${f.decimal1.format(extra.stdevReturnPct)} pts`, `spread ±${f.decimal1.format(extra.stdevReturnPct)} pts`)} hint={t("Media aritmética de las rentabilidades. La dispersión indica cuánto se separan, de media, las ventanas de ese valor.", "Arithmetic average of the returns. The spread shows how far the windows are from that value, on average.")} />
            <StatTile label={t("Racha sin ganar", "Longest dry run")} value={t(`${extra.losingStreak} seguidas`, `${extra.losingStreak} in a row`)} sub={t("ventanas consecutivas sin beneficio", "consecutive windows without profit")} tone={extra.losingStreak <= 1 ? "good" : extra.losingStreak <= 3 ? "mixed" : "bad"} />
            <StatTile label={t("Órdenes por ventana", "Orders per window")} value={extra.avgOrders === null ? "—" : f.count.format(Math.round(extra.avgOrders))} sub={t("de media", "on average")} hint={t("Con muy pocas órdenes por ventana, cada resultado depende de una o dos operaciones y es menos fiable.", "With very few orders per window, each result depends on one or two trades and is less reliable.")} />
            <StatTile label={t("Tiempo en mercado", "Time in the market")} value={extra.avgExposurePct === null ? "—" : `${f.pct(extra.avgExposurePct, 0)}`} sub={t("con posición abierta", "with an open position")} meter={extra.avgExposurePct === null ? undefined : extra.avgExposurePct / 100} hint={t("Parte media del periodo con una posición abierta. Menos tiempo en mercado implica menos exposición a caídas.", "Average share of the period with an open position. Less time in the market means less exposure to falls.")} />
          </dl>
          <WindowsTable result={result} hover={hoverWin} onHover={(i) => (i === null ? clearHover() : hoverAt(i, "table"))} />
        </>
      }
    />
  )
}

function WindowsTable({ result, hover, onHover }: { result: WindowsBatchResult; hover: number | null; onHover: (i: number | null) => void }) {
  const { locale, t, f } = useReplayText()
  const toneOf = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "")
  return (
    <section aria-label={t("Detalle por ventana", "Detail by window")} className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-caption" onPointerLeave={() => onHover(null)}>
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">{t("Ventana", "Window")}</th>
              <th className="px-3 py-2 font-semibold">{t("Curva", "Curve")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Estrategia", "Strategy")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Mantener", "Hold")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Diferencia", "Difference")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Caída máx.", "Max drawdown")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Acierto", "Win rate")}</th>
              <th className="px-3 py-2 text-right font-semibold">Sharpe</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Órdenes", "Orders")}</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item, i) => {
              const s: RunSummary | null = item.summary
              return (
                <tr key={item.start} className={cn("border-t transition-colors", hover === i && "bg-accent/50")} onPointerEnter={() => onHover(i)}>
                  <td className="num px-3 py-2">
                    <span className="mr-2 text-muted-foreground">{i + 1}</span>
                    {formatDate(item.start, locale)} → {formatDate(item.end, locale)}
                  </td>
                  {s ? (
                    <>
                      <td className="px-3 py-1.5">
                        <Spark curve={s.curve} hold={s.benchmarkCurve} width={92} height={26} />
                      </td>
                      <td className={cn("num px-3 py-2 text-right font-semibold", toneOf(s.returnPct))}>{f.signedPct(s.returnPct)}</td>
                      <td className={cn("num px-3 py-2 text-right", toneOf(s.benchmarkReturnPct))}>{f.signedPct(s.benchmarkReturnPct)}</td>
                      <td className={cn("num px-3 py-2 text-right font-semibold", toneOf(s.returnPct - s.benchmarkReturnPct))}>{f.pts(s.returnPct - s.benchmarkReturnPct)}</td>
                      <td className="num px-3 py-2 text-right">−{f.pct(s.maxDrawdownPct)}</td>
                      <td className="num px-3 py-2 text-right">{s.roundTrips ? f.pct(s.winRatePct, 0) : "—"}</td>
                      <td className="num px-3 py-2 text-right">{f.ratio.format(s.sharpe)}</td>
                      <td className="num px-3 py-2 text-right">{s.orders}</td>
                    </>
                  ) : (
                    <td colSpan={8} className="px-3 py-2 text-right text-muted-foreground">
                      {t("Sin velas del activo en este tramo", "No candles of the asset in this stretch")}
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
