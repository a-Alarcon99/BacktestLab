"use client"

import { useState, type CSSProperties } from "react"
import { cn } from "cn"
import { resultBins } from "@/lib/backtest-report"
import type { BacktestResult, PeriodUnit } from "@/lib/backtests"
import { clamp, niceTicks } from "@/lib/chart-geometry"
import { useReplayText, type ReplayFormats } from "../replay/format"
import { ChartCard, Legend } from "./parts"

const delay = (s: number) => ({ "--bt-delay": `${s}s` }) as CSSProperties
const PAD = { l: 8, r: 60, t: 14, b: 24 }

function Tip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-44 rounded-md border bg-popover/95 px-2 py-1 text-[11px] shadow-sm"
      style={{ left: clamp(x - 88, 0, Math.max(0, width - 176)) }}
    >
      {children}
    </div>
  )
}

/** Bars from a zero line: positive grow up, negative grow down. */
function ValueAxis({ ticks, y, width, f }: { ticks: number[]; y: (v: number) => number; width: number; f: ReplayFormats }) {
  return (
    <>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : "2 4"} />
          <text x={width - PAD.r + 6} y={y(v) + 3.5} className="num fill-muted-foreground text-[10px]">
            {v === 0 ? "0" : f.signedPct(v, Math.abs(ticks[1] - ticks[0]) < 1 ? 2 : 1)}
          </text>
        </g>
      ))}
    </>
  )
}

export function TradeResultsChart({
  result,
  selected,
  onSelect,
}: {
  result: BacktestResult
  selected: number | null
  onSelect: (trip: number) => void
}) {
  const { t, f } = useReplayText()
  const [hover, setHover] = useState<number | null>(null)
  const trips = result.roundTrips
  const avg = result.metrics.expectancyPct
  return (
    <ChartCard
      title={t("Resultado de cada operación", "Result of each trade")}
      reading={t(
        "Cada barra es una operación, en orden. Verde ganó, rojo perdió. Pulsa una para verla en el gráfico.",
        "Each bar is a trade, in order. Green won, red lost. Click one to see it on the chart."
      )}
      info={t(
        "El porcentaje que ganó o perdió cada operación sobre lo invertido en ella, con comisiones. La línea discontinua es el resultado medio. Una operación que sigue abierta aparece más clara.",
        "The percentage each trade made or lost on what was invested in it, fees included. The dashed line is the average result. A trade still open is shown lighter."
      )}
    >
      {(width) => {
        const H = 200
        if (!trips.length) return <Empty text={t("No hubo operaciones.", "There were no trades.")} />
        const values = trips.map((trip) => trip.pnlPct)
        const lo = Math.min(0, ...values)
        const hi = Math.max(0, ...values)
        const ticks = niceTicks(lo, hi, 4)
        const d0 = Math.min(lo, ticks[0] ?? lo)
        const d1 = Math.max(hi, ticks[ticks.length - 1] ?? hi)
        const plotW = width - PAD.l - PAD.r
        const y = (v: number) => PAD.t + (1 - (v - d0) / (d1 - d0 || 1)) * (H - PAD.t - PAD.b)
        // Few trades shouldn't become huge blocks: bars are at most 44 px, centred.
        const bw = Math.min(plotW / trips.length, 44)
        const x0 = PAD.l + (plotW - bw * trips.length) / 2
        const gap = bw > 6 ? Math.min(bw * 0.25, 8) : bw > 3 ? 1 : 0
        const zero = y(0)
        return (
          <div className="relative" onPointerLeave={() => setHover(null)}>
            <svg width={width} height={H} role="img" aria-label={t("Barras con el resultado de cada operación", "Bars with each trade's result")} className="block">
              <ValueAxis ticks={ticks} y={y} width={width} f={f} />
              {trips.map((trip, k) => {
                const up = trip.pnlPct >= 0
                const top = y(Math.max(trip.pnlPct, 0))
                const h = Math.max(Math.abs(y(trip.pnlPct) - zero), 1)
                const x = x0 + k * bw + gap / 2
                return (
                  <rect
                    key={k}
                    className="bt-grow cursor-pointer"
                    style={{ ...delay(Math.min(k * 0.012, 0.7)), transformOrigin: up ? "50% 100%" : "50% 0%" }}
                    x={x}
                    y={top}
                    width={Math.max(bw - gap, 0.6)}
                    height={h}
                    rx={bw > 8 ? 1.5 : 0}
                    fill={up ? "var(--up)" : "var(--down)"}
                    opacity={trip.open ? 0.4 : hover === null || hover === k ? 0.9 : 0.45}
                    stroke={selected === k ? "var(--foreground)" : "none"}
                    strokeWidth={1.5}
                    onPointerEnter={() => setHover(k)}
                    onClick={() => onSelect(k)}
                  />
                )
              })}
              {avg !== null && (
                <g className="bt-fade" style={delay(0.8)}>
                  <line x1={PAD.l} x2={width - PAD.r} y1={y(avg)} y2={y(avg)} stroke="var(--primary)" strokeDasharray="5 3" strokeWidth={1.25} />
                  <text
                    x={width - PAD.r - 4}
                    y={PAD.t - 3}
                    textAnchor="end"
                    stroke="var(--card)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="num fill-primary text-[10px] font-bold"
                  >
                    {t("media", "average")} {f.signedPct(avg, 2)}
                  </text>
                </g>
              )}
              <text x={PAD.l} y={H - 6} className="fill-muted-foreground text-[10px]">
                {t("1.ª", "1st")}
              </text>
              <text x={width - PAD.r} y={H - 6} textAnchor="end" className="num fill-muted-foreground text-[10px]">
                {t(`${trips.length}.ª`, `#${trips.length}`)}
              </text>
            </svg>
            {hover !== null && trips[hover] && (
              <Tip x={x0 + (hover + 0.5) * bw} width={width}>
                <p className="num font-semibold">
                  #{hover + 1} · {f.date.format(new Date(trips[hover].entryTime))}
                </p>
                <p className={cn("num font-bold", trips[hover].pnl >= 0 ? "text-up" : "text-down")}>
                  {f.signedPct(trips[hover].pnlPct, 2)} · {f.usdt(trips[hover].pnl, true)}
                </p>
                <p className="text-muted-foreground">
                  {trips[hover].open ? t("Sigue abierta", "Still open") : f.duration(trips[hover].durationSeconds)}
                </p>
              </Tip>
            )}
          </div>
        )
      }}
    </ChartCard>
  )
}

export function DistributionChart({ result }: { result: BacktestResult }) {
  const { t, f } = useReplayText()
  const [hover, setHover] = useState<number | null>(null)
  const closed = result.roundTrips.filter((trip) => !trip.open).map((trip) => trip.pnlPct)
  const { edges, counts } = resultBins(closed)
  return (
    <ChartCard
      title={t("Cómo se reparten los resultados", "How results are spread")}
      reading={t(
        "Cuántas operaciones terminaron en cada tramo. Mejor si hay más verde y el rojo queda cerca del cero.",
        "How many trades ended in each range. Better with more green and the red close to zero."
      )}
      info={t(
        "Agrupa las operaciones cerradas por su resultado. Una estrategia sana corta pronto las pérdidas (barras rojas pequeñas y cerca del 0) y deja correr algunas ganancias grandes.",
        "Groups the closed trades by result. A healthy strategy cuts losses early (small red bars near 0) and lets some big gains run."
      )}
    >
      {(width) => {
        const H = 200
        if (!closed.length) return <Empty text={t("Ninguna operación cerrada.", "No closed trades.")} />
        const max = Math.max(...counts)
        const bw = Math.min((width - PAD.l - 12) / counts.length, 72)
        const plotW = bw * counts.length
        const left = PAD.l + (width - PAD.l - 12 - plotW) / 2
        const y = (v: number) => PAD.t + (1 - v / (max * 1.12)) * (H - PAD.t - PAD.b)
        const every = Math.ceil(edges.length / Math.max(2, Math.floor(plotW / 48)))
        const digits = Math.abs(edges[1] - edges[0]) < 1 ? 2 : 1
        const upper = (k: number) => edges[k + 1] ?? edges[k] + (edges[1] - edges[0])
        return (
          <div className="relative" onPointerLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label={t("Histograma de resultados de las operaciones", "Histogram of trade results")} className="block">
            <line x1={left} x2={left + plotW} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />
            {counts.map((count, k) => {
              const up = edges[k] >= 0
              const x = left + k * bw
              return (
                <g key={k} onPointerEnter={() => setHover(k)} opacity={hover === null || hover === k ? 1 : 0.5}>
                  {hover === k && <rect x={x} y={PAD.t - 6} width={bw} height={y(0) - PAD.t + 6} rx={4} fill="var(--primary)" opacity={0.08} />}
                  {count > 0 && (
                    <>
                      <rect
                        className="bt-grow"
                        style={{ ...delay(k * 0.05), transformOrigin: "50% 100%" }}
                        x={x + 1.5}
                        y={y(count)}
                        width={Math.max(bw - 3, 1)}
                        height={y(0) - y(count)}
                        rx={3}
                        fill={up ? "var(--up)" : "var(--down)"}
                        opacity={0.85}
                      />
                      <text className="bt-fade num fill-foreground text-[10px] font-semibold" style={delay(0.5 + k * 0.05)} x={x + bw / 2} y={y(count) - 4} textAnchor="middle">
                        {count}
                      </text>
                    </>
                  )}
                  <rect x={x} y={0} width={bw} height={H} fill="transparent" />
                </g>
              )
            })}
            {edges.map((edge, k) =>
              k % every === 0 || edge === 0 ? (
                <text key={k} x={clamp(left + k * bw, 22, width - 22)} y={H - 8} textAnchor="middle" className={cn("num text-[10px]", edge === 0 ? "fill-foreground font-bold" : "fill-muted-foreground")}>
                  {edge === 0 ? "0" : f.signedPct(edge, Math.abs(edges[1] - edges[0]) < 1 ? 2 : 0)}
                </text>
              ) : null
            )}
          </svg>
          {hover !== null && (
            <Tip x={left + (hover + 0.5) * bw} width={width}>
              <p className="num font-semibold">
                {f.signedPct(edges[hover], digits)} → {f.signedPct(upper(hover), digits)}
              </p>
              <p className="num font-bold">{t(f.plural(counts[hover], "operación", "operaciones"), `${f.count.format(counts[hover])} ${counts[hover] === 1 ? "trade" : "trades"}`)}</p>
              <p className="num text-muted-foreground">{t(`${f.pct((counts[hover] / closed.length) * 100, 0)} del total`, `${f.pct((counts[hover] / closed.length) * 100, 0)} of the total`)}</p>
            </Tip>
          )}
          </div>
        )
      }}
    </ChartCard>
  )
}

function periodLabel(start: string, unit: PeriodUnit, f: ReplayFormats, locale: "es" | "en") {
  const d = new Date(`${start}T00:00:00Z`)
  if (unit === "year") return String(d.getUTCFullYear())
  if (unit === "quarter") return `${locale === "es" ? "T" : "Q"}${Math.floor(d.getUTCMonth() / 3) + 1} ${String(d.getUTCFullYear()).slice(2)}`
  if (unit === "month") return f.month.format(d)
  return f.axisDate.format(d)
}

export function PeriodChart({ result }: { result: BacktestResult }) {
  const { locale, t, f } = useReplayText()
  const [hover, setHover] = useState<number | null>(null)
  const { unit, items } = result.periods
  const unitName = {
    day: t("día", "day"),
    week: t("semana", "week"),
    month: t("mes", "month"),
    quarter: t("trimestre", "quarter"),
    year: t("año", "year"),
  }[unit]
  const positive = items.filter((p) => p.returnPct > 0).length
  return (
    <ChartCard
      title={t(`Rentabilidad por ${unitName}`, `Return per ${unitName}`)}
      reading={t(
        `Cuánto ganó o perdió en cada ${unitName}. La raya gris es lo que hizo comprar y mantener.`,
        `How much it made or lost each ${unitName}. The grey tick is what buy and hold did.`
      )}
      info={t(
        "Divide el periodo en tramos iguales y muestra el resultado de cada uno. Sirve para ver si la estrategia gana de forma regular o depende de unos pocos momentos buenos.",
        "Splits the period into equal parts and shows each one's result. It shows whether the strategy gains steadily or depends on a few good moments."
      )}
      aside={
        <span className="num shrink-0 rounded-md bg-muted px-2 py-1 text-caption font-semibold text-muted-foreground">
          {t(`${positive} de ${items.length} en positivo`, `${positive} of ${items.length} positive`)}
        </span>
      }
    >
      {(width) => {
        const H = 200
        if (!items.length) return <Empty text="—" />
        const values = items.flatMap((p) => [p.returnPct, p.benchmarkPct])
        const lo = Math.min(0, ...values)
        const hi = Math.max(0, ...values)
        const ticks = niceTicks(lo, hi, 4)
        const d0 = Math.min(lo, ticks[0] ?? lo)
        const d1 = Math.max(hi, ticks[ticks.length - 1] ?? hi)
        const plotW = width - PAD.l - PAD.r
        const y = (v: number) => PAD.t + (1 - (v - d0) / (d1 - d0 || 1)) * (H - PAD.t - PAD.b)
        const bw = Math.min(plotW / items.length, 56)
        const x0 = PAD.l + (plotW - bw * items.length) / 2
        const every = Math.ceil(items.length / Math.max(2, Math.floor(plotW / 52)))
        return (
          <div className="relative" onPointerLeave={() => setHover(null)}>
            <svg width={width} height={H} role="img" aria-label={t("Barras de rentabilidad por periodo", "Return per period bars")} className="block">
              <ValueAxis ticks={ticks} y={y} width={width} f={f} />
              {items.map((p, k) => {
                const up = p.returnPct >= 0
                const x = x0 + k * bw
                const inner = Math.max(bw * 0.62, 1)
                return (
                  <g key={p.start} onPointerEnter={() => setHover(k)} opacity={hover === null || hover === k ? 1 : 0.55}>
                    <rect x={x} y={PAD.t} width={bw} height={H - PAD.t - PAD.b} fill="transparent" />
                    <rect
                      className="bt-grow"
                      style={{ ...delay(k * 0.03), transformOrigin: up ? "50% 100%" : "50% 0%" }}
                      x={x + (bw - inner) / 2}
                      y={y(Math.max(p.returnPct, 0))}
                      width={inner}
                      height={Math.max(Math.abs(y(p.returnPct) - y(0)), 1)}
                      rx={bw > 10 ? 2 : 0}
                      fill={up ? "var(--up)" : "var(--down)"}
                      opacity={0.85}
                    />
                    <line
                      className="bt-fade"
                      style={delay(0.6 + k * 0.03)}
                      x1={x + bw * 0.12}
                      x2={x + bw * 0.88}
                      y1={y(p.benchmarkPct)}
                      y2={y(p.benchmarkPct)}
                      stroke="var(--muted-foreground)"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    {k % every === 0 && (
                      <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="num fill-muted-foreground text-[10px]">
                        {periodLabel(p.start, unit, f, locale)}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            {hover !== null && items[hover] && (
              <Tip x={x0 + (hover + 0.5) * bw} width={width}>
                <p className="num font-semibold">{periodLabel(items[hover].start, unit, f, locale)}</p>
                <p className={cn("num font-bold", items[hover].returnPct >= 0 ? "text-up" : "text-down")}>
                  {t("Estrategia", "Strategy")} {f.signedPct(items[hover].returnPct, 2)}
                </p>
                <p className="num text-muted-foreground">
                  {t("Comprar y mantener", "Buy and hold")} {f.signedPct(items[hover].benchmarkPct, 2)}
                </p>
              </Tip>
            )}
            <div className="mt-1">
              <Legend
                items={[
                  { label: t("Estrategia", "Strategy"), className: "bg-up" },
                  { label: t("Comprar y mantener", "Buy and hold"), className: "bg-muted-foreground" },
                ]}
              />
            </div>
          </div>
        )
      }}
    </ChartCard>
  )
}

/** Donut arc from `a0` to `a1` (fractions of a turn, from 12 o'clock). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin(a * 2 * Math.PI), cy - r * Math.cos(a * 2 * Math.PI)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(Math.min(a1, a0 + 0.9999))
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
}

export function WinLossChart({ result }: { result: BacktestResult }) {
  const { t, f } = useReplayText()
  const [segment, setSegment] = useState<"win" | "loss" | null>(null)
  const m = result.metrics
  const share = m.roundTrips ? m.wins / m.roundTrips : 0
  const breakEven = m.payoffRatio !== null ? 100 / (1 + m.payoffRatio) : null
  const winBig = Math.abs(m.avgWinPct ?? 0)
  const lossBig = Math.abs(m.avgLossPct ?? 0)
  const scale = Math.max(winBig, lossBig, 0.01)
  const enough = breakEven === null ? null : m.winRatePct >= breakEven
  return (
    <ChartCard
      title={t("Ganadoras y perdedoras", "Winners and losers")}
      reading={t(
        "Cuántas operaciones ganaron, cuánto gana una buena frente a lo que pierde una mala, y el acierto que haría falta para no perder.",
        "How many trades won, how much a good one makes against what a bad one loses, and the win rate needed not to lose."
      )}
      info={t(
        "Acierto y tamaño van juntos: si cada ganancia es el doble que cada pérdida, basta con acertar 1 de cada 3 para no perder. La barra inferior compara tu acierto con el mínimo necesario según tus ganancias y pérdidas medias.",
        "Win rate and size go together: if each gain is twice each loss, winning 1 in 3 is enough not to lose. The bottom bar compares your win rate with the minimum needed given your average gains and losses."
      )}
    >
      {(width) => {
        if (!m.roundTrips) return <Empty text={t("Ninguna operación cerrada.", "No closed trades.")} />
        const donut = 132
        const wide = width >= 420
        return (
          <div className={cn("flex gap-5", wide ? "flex-row items-center" : "flex-col items-center")}>
            <svg width={donut} height={donut} viewBox="0 0 132 132" className="shrink-0" role="img" aria-label={t(`${m.wins} ganadas y ${m.losses} perdidas`, `${m.wins} won and ${m.losses} lost`)} onPointerLeave={() => setSegment(null)}>
              <circle cx={66} cy={66} r={52} fill="none" stroke="var(--muted)" strokeWidth={16} />
              {share > 0 && (
                <path className="bt-draw cursor-default" d={arc(66, 66, 52, 0, share)} pathLength={1} strokeDasharray={1} fill="none" stroke="var(--up)" strokeWidth={segment === "win" ? 20 : 16} opacity={segment === "loss" ? 0.45 : 1} onPointerEnter={() => setSegment("win")} />
              )}
              {share < 1 && (
                <path
                  className="bt-draw"
                  style={delay(0.5)}
                  d={arc(66, 66, 52, share, 1)}
                  pathLength={1}
                  strokeDasharray={1}
                  fill="none"
                  stroke="var(--down)"
                  strokeWidth={segment === "loss" ? 20 : 16}
                  opacity={segment === "win" ? 0.45 : 1}
                  onPointerEnter={() => setSegment("loss")}
                />
              )}
              <text x={66} y={66} textAnchor="middle" className={cn("num text-[22px] font-bold", segment === "win" ? "fill-up" : segment === "loss" ? "fill-down" : "fill-foreground")}>
                {segment === "win" ? f.count.format(m.wins) : segment === "loss" ? f.count.format(m.losses) : f.pct(m.winRatePct, 0)}
              </text>
              <text x={66} y={84} textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
                {segment === "win" ? t("ganadas", "won") : segment === "loss" ? t("perdidas", "lost") : t("de acierto", "win rate")}
              </text>
            </svg>
            <div className="flex w-full min-w-0 flex-col gap-3">
              <p className="num text-caption">
                <b className="text-up">{t(f.plural(m.wins, "ganada", "ganadas"), `${f.count.format(m.wins)} won`)}</b> ·{" "}
                <b className="text-down">{t(f.plural(m.losses, "perdida", "perdidas"), `${f.count.format(m.losses)} lost`)}</b>
              </p>
              {[
                { label: t("Ganancia media", "Average win"), value: m.avgWinPct, big: winBig, color: "bg-up" },
                { label: t("Pérdida media", "Average loss"), value: m.avgLossPct, big: lossBig, color: "bg-down" },
              ].map((row, k) => (
                <div key={row.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-caption">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="num font-semibold">{row.value !== null ? f.signedPct(row.value, 2) : "—"}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("bt-grow-x h-full rounded-full", row.color)}
                      style={{ ...delay(0.3 + k * 0.15), width: `${(row.big / scale) * 100}%`, transformOrigin: "0 50%" }}
                    />
                  </div>
                </div>
              ))}
              {breakEven !== null && (
                <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-2.5">
                  <div className="relative h-2.5 rounded-full bg-background">
                    <div
                      className={cn("bt-grow-x absolute inset-y-0 left-0 rounded-full", enough ? "bg-up" : "bg-down")}
                      style={{ ...delay(0.6), width: `${clamp(m.winRatePct / 100) * 100}%`, transformOrigin: "0 50%" }}
                    />
                    <div className="absolute -inset-y-1 w-0.5 rounded bg-foreground" style={{ left: `${clamp(breakEven / 100) * 100}%` }} />
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {enough
                      ? t(
                          `Acierta un ${f.pct(m.winRatePct, 0)} y le bastaría con un ${f.pct(breakEven, 0)}: sus ganancias compensan sus pérdidas.`,
                          `It wins ${f.pct(m.winRatePct, 0)} and ${f.pct(breakEven, 0)} would be enough: its gains make up for its losses.`
                        )
                      : t(
                          `Acierta un ${f.pct(m.winRatePct, 0)}, pero necesitaría al menos un ${f.pct(breakEven, 0)} para no perder con estas ganancias y pérdidas.`,
                          `It wins ${f.pct(m.winRatePct, 0)}, but would need at least ${f.pct(breakEven, 0)} not to lose with these gains and losses.`
                        )}
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      }}
    </ChartCard>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="flex h-32 items-center justify-center text-caption text-muted-foreground">{text}</p>
}
