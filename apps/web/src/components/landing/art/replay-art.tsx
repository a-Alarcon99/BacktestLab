"use client"

import { useRef, useState, type CSSProperties } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import {
  areaPath,
  bandPath,
  candleShapes,
  clamp,
  extent,
  linePath,
  linear,
  niceTicks,
  pad,
  runningFigures,
  slotX,
} from "@/lib/landing/geometry"
import { snapshot } from "@/lib/landing/snapshot"
import { presetInfo } from "@/lib/preset-strategies"
import { cn } from "@/lib/utils"
import { dayRange, dayTime, num, pct } from "../format"
import { useCssLoop, useShouldPlay } from "../motion"

// A1 · Hero: the replay of a real backtest, revealed candle by candle like the product's
// `ReplayPlayer`. Driven by CSS animations (one per element, delays from the data) restarted every
// cycle; hovering switches to "explore": the finished chart with a crosshair that reads the candle.

const W = 720
const H = 430
const X0 = 8
const X1 = 658
const PRICE_TOP = 18
const PRICE_BOTTOM = 286
const EQ_TOP = 326
const EQ_BOTTOM = 414
const REVEAL = 9
const CYCLE = REVEAL + 3.5
const EASE = "cubic-bezier(.22,1,.36,1)"
const HOUR = 3_600_000

const data = snapshot.replay
const capital = snapshot.initialCapital
const N = data.candles.length
const slot = (X1 - X0) / N
const xAt = (i: number) => slotX(i, N, X0, X1)
/** Second of the cycle at which candle `i` is revealed. */
const revealAt = (i: number) => (i / N) * REVEAL

const priceRange = pad(extent([...data.candles.flatMap((c) => [c[1], c[2]]), ...data.lower, ...data.upper]), 0.04)
const yPrice = linear(priceRange[0], priceRange[1], PRICE_BOTTOM, PRICE_TOP)
const candles = candleShapes(data.candles, X0, X1, yPrice)
const band = bandPath(
  data.upper.map((v, i) => ({ x: xAt(i), y: yPrice(v) })),
  data.lower.map((v, i) => ({ x: xAt(i), y: yPrice(v) }))
)
const upperLine = linePath(data.upper.map((v, i) => ({ x: xAt(i), y: yPrice(v) })))
const lowerLine = linePath(data.lower.map((v, i) => ({ x: xAt(i), y: yPrice(v) })))
const priceTicks = niceTicks(priceRange[0], priceRange[1], 4)

const equityRange = pad(extent([...data.equity, capital]), 0.25)
const yEquity = linear(equityRange[0], equityRange[1], EQ_BOTTOM, EQ_TOP)
const equityPoints = data.equity.map((v, i) => ({ x: xAt(i), y: yEquity(v) }))
const equityLine = linePath(equityPoints)
const equityArea = areaPath(equityPoints, EQ_BOTTOM)
const figures = runningFigures(data.trades, data.equity, capital)
/** When each trade's figures reach the KPI row: right after its exit candle shows up. */
const figureTimes = figures.map((f) => revealAt(f.at) + 0.25)
const startMs = Date.parse(data.start)

const anim = (name: string, duration: number, delay: number, easing = EASE) =>
  `${name} ${duration}s ${easing} ${delay.toFixed(3)}s both`

function ReplayArt() {
  const { locale, t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const { play, reduced } = useShouldPlay(ref)
  const [hover, setHover] = useState<number | null>(null)
  const exploring = hover !== null
  const { cycle, restart } = useCssLoop(CYCLE, play && !exploring)

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * W
    setHover(clamp(Math.floor((x - X0) / slot), 0, N - 1))
  }
  const onPointerLeave = () => {
    setHover(null)
    restart()
  }

  const kpis = [
    {
      label: t("Rentabilidad", "Return"),
      values: [pct(locale, 0), ...figures.map((f) => pct(locale, f.returnPct))],
      tone: [null, ...figures.map((f) => (f.returnPct >= 0 ? "up" : "down"))],
    },
    {
      label: "Win rate",
      values: ["—", ...figures.map((f) => pct(locale, f.winRatePct, { signed: false, digits: 1 }))],
      tone: [],
    },
    {
      label: t("Drawdown máx.", "Max drawdown"),
      values: [pct(locale, 0), ...figures.map((f) => pct(locale, -f.maxDrawdownPct))],
      tone: [null, ...figures.map((f) => (f.maxDrawdownPct > 0 ? "down" : null))],
    },
    {
      label: t("Operaciones", "Trades"),
      values: ["0", ...figures.map((f) => String(f.trades))],
      tone: [],
    },
  ]

  const name = presetInfo["preset-short"].name[locale]
  const status = exploring ? t("Explorando", "Exploring") : t("Reproduciendo", "Replaying")

  return (
    <figure
      ref={ref}
      data-paused={play ? "false" : "true"}
      data-explore={exploring ? "true" : "false"}
      className="relative overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10 ring-1 ring-foreground/[0.03]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <AssetAvatar symbol={snapshot.symbol} size={24} />
        <span className="font-semibold">{snapshot.symbol}/USDT</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-caption font-semibold text-muted-foreground">
          {data.timeframe}
        </span>
        <span className="hidden truncate text-muted-foreground sm:inline">{name}</span>
        <span className="ml-auto flex items-center gap-2 text-caption font-semibold text-muted-foreground">
          <span className="relative flex size-2">
            {!exploring && !reduced && (
              <span className="lp-anim absolute inset-0 rounded-full bg-primary" style={{ animation: "lp-breathe 1.6s ease-in-out infinite" }} />
            )}
            <span className="relative size-2 rounded-full bg-primary" />
          </span>
          {status}
        </span>
      </div>

      <dl key={`kpi-${cycle}`} className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-0.5 bg-card px-4 py-2.5">
            <dt className="text-caption text-muted-foreground">{kpi.label}</dt>
            <dd className="relative h-6 overflow-hidden">
              {kpi.values.map((value, k) => {
                const last = k === kpi.values.length - 1
                const start = k === 0 ? 0 : figureTimes[k - 1]
                const style: CSSProperties = last
                  ? { animation: k === 0 ? undefined : anim("lp-enter", 0.45, start) }
                  : { opacity: 0, animation: anim("lp-window", figureTimes[k] - start, start, "ease-out") }
                const tone = kpi.tone[k]
                return (
                  <span
                    key={k}
                    aria-hidden={!last}
                    style={style}
                    className={cn(
                      "lp-anim num absolute inset-0 text-title font-bold tracking-tight",
                      tone === "up" && "text-up",
                      tone === "down" && "text-down"
                    )}
                  >
                    {value}
                  </span>
                )
              })}
            </dd>
          </div>
        ))}
      </dl>

      <div className="relative border-t">
        <svg
          key={`chart-${cycle}`}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t(
            `Replay de un backtest real de ${name} sobre ${snapshot.symbol}/USDT en velas de ${data.timeframe}: ${data.trades.length} operaciones, rentabilidad ${pct(locale, data.stats.returnPct)}.`,
            `Replay of a real ${name} backtest on ${snapshot.symbol}/USDT ${data.timeframe} candles: ${data.trades.length} trades, ${pct(locale, data.stats.returnPct)} return.`
          )}
          className="block w-full touch-pan-y select-none"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <defs>
            <linearGradient id="lp-eq-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lp-scan" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0.16" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {priceTicks.map((v) => (
            <line key={v} x1={X0} x2={X1} y1={yPrice(v)} y2={yPrice(v)} stroke="var(--border)" />
          ))}
          <line x1={X0} x2={X1} y1={EQ_BOTTOM} y2={EQ_BOTTOM} stroke="var(--border)" />

          {/* Revealed by the curtain: bands, positions, equity */}
          <path d={band} fill="var(--primary)" opacity={0.07} />
          <path d={upperLine} fill="none" stroke="var(--primary)" strokeOpacity={0.4} strokeWidth={1} />
          <path d={lowerLine} fill="none" stroke="var(--primary)" strokeOpacity={0.4} strokeWidth={1} />
          {data.trades.map((trade) => {
            const x0 = xAt(trade.entry) - slot / 2
            const x1 = xAt(trade.exit) + slot / 2
            const win = trade.pnlPct > 0
            return (
              <g key={trade.entry}>
                <rect
                  x={x0}
                  y={PRICE_TOP}
                  width={x1 - x0}
                  height={PRICE_BOTTOM - PRICE_TOP}
                  fill={win ? "var(--up-soft)" : "var(--down-soft)"}
                />
                <line
                  x1={x0}
                  x2={x1}
                  y1={yPrice(trade.entryPrice)}
                  y2={yPrice(trade.entryPrice)}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                />
              </g>
            )
          })}
          <line
            x1={X0}
            x2={X1}
            y1={yEquity(capital)}
            y2={yEquity(capital)}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.5}
            strokeDasharray="2 4"
          />
          <path d={equityArea} fill="url(#lp-eq-fill)" />
          <path d={equityLine} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />

          <rect
            className="lp-anim"
            x={X0 - 1}
            y={0}
            width={W}
            height={H}
            fill="var(--card)"
            style={
              {
                transform: `translateX(${W}px)`,
                "--lp-from": "0px",
                "--lp-to": `${X1 - X0}px`,
                animation: anim("lp-slide", REVEAL, 0, "linear"),
              } as CSSProperties
            }
          />

          {/* Axis labels (above the curtain) */}
          {priceTicks.map((v) => (
            <text
              key={v}
              x={W - 4}
              y={yPrice(v) + 3.5}
              textAnchor="end"
              className="num fill-muted-foreground text-[10px]"
            >
              {num(locale, v)}
            </text>
          ))}
          <text x={X0} y={EQ_TOP - 10} className="fill-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            {t("Capital (USDT)", "Equity (USDT)")}
          </text>
          <text x={W - 4} y={yEquity(capital) + 3.5} textAnchor="end" className="num fill-muted-foreground text-[10px]">
            {num(locale, capital)}
          </text>

          {/* Candles, one by one */}
          {candles.map((c, i) => (
            <g
              key={i}
              className={cn("lp-anim lp-box", c.up ? "fill-up stroke-up" : "fill-down stroke-down")}
              style={{ animation: anim("lp-rise", 0.45, revealAt(i)) }}
            >
              <line x1={c.x} x2={c.x} y1={c.wickTop} y2={c.wickBottom} strokeWidth={1} />
              <rect x={c.x - slot * 0.32} y={c.bodyY} width={slot * 0.64} height={c.bodyH} stroke="none" />
            </g>
          ))}

          {/* Orders */}
          {data.trades.map((trade) => {
            const buy = candles[trade.entry]
            const sell = candles[trade.exit]
            const buyY = Math.min(buy.wickBottom + 10, PRICE_BOTTOM + 8)
            const sellY = Math.max(sell.wickTop - 10, PRICE_TOP + 6)
            const buyAt = revealAt(trade.entry) + 0.2
            const sellAt = revealAt(trade.exit) + 0.2
            const label = `RSI ${num(locale, trade.entryRsi)} · ${t("bajo la banda", "below the band")} → ${t("Compra", "Buy")}`
            const labelW = label.length * 5.7 + 18
            const labelX = clamp(buy.x - labelW / 2, X0, X1 - labelW)
            const labelBelow = buyY + 36 < PRICE_BOTTOM + 24
            const labelY = labelBelow ? buyY + 10 : buy.wickTop - 34
            const win = trade.pnlPct > 0
            const pill = pct(locale, trade.pnlPct)
            const pillW = pill.length * 6.4 + 16
            return (
              <g key={trade.entry}>
                <circle
                  className="lp-anim lp-box"
                  cx={buy.x}
                  cy={buyY}
                  r={9}
                  fill="none"
                  stroke="var(--up)"
                  strokeWidth={1.5}
                  style={{ opacity: 0, animation: anim("lp-ripple", 0.9, buyAt, "ease-out") }}
                />
                <path
                  className="lp-anim lp-box"
                  d={`M${buy.x} ${buyY - 5}L${buy.x + 5.5} ${buyY + 4}L${buy.x - 5.5} ${buyY + 4}Z`}
                  fill="var(--up)"
                  style={{ animation: anim("lp-pop", 0.5, buyAt) }}
                />
                <g className="lp-anim" style={{ opacity: 0, animation: anim("lp-flash", 2.6, buyAt + 0.1, "ease") }}>
                  <rect x={labelX} y={labelY} width={labelW} height={20} rx={6} fill="var(--popover)" stroke="var(--border-strong)" />
                  <text x={labelX + 9} y={labelY + 13.5} className="fill-foreground text-[10.5px] font-semibold">
                    {label}
                  </text>
                </g>

                <path
                  className="lp-anim lp-box"
                  d={`M${sell.x} ${sellY + 5}L${sell.x + 5.5} ${sellY - 4}L${sell.x - 5.5} ${sellY - 4}Z`}
                  fill="var(--down)"
                  style={{ animation: anim("lp-pop", 0.5, sellAt) }}
                />
                <g className="lp-anim" style={{ opacity: 0, animation: anim("lp-float", 2.2, sellAt + 0.05, "ease-out") }}>
                  <rect
                    x={clamp(sell.x - pillW / 2, X0, X1 - pillW)}
                    y={Math.max(sellY - 32, 2)}
                    width={pillW}
                    height={20}
                    rx={10}
                    fill="var(--card)"
                    stroke={win ? "var(--up)" : "var(--down)"}
                    strokeWidth={1.5}
                  />
                  <text
                    x={clamp(sell.x - pillW / 2, X0, X1 - pillW) + pillW / 2}
                    y={Math.max(sellY - 32, 2) + 14}
                    textAnchor="middle"
                    className={cn("num text-[11px] font-bold", win ? "fill-up" : "fill-down")}
                  >
                    {pill}
                  </text>
                </g>
              </g>
            )
          })}

          {/* Playhead */}
          <g
            className="lp-anim"
            style={
              {
                opacity: 0,
                "--lp-from": `${xAt(0)}px`,
                "--lp-to": `${xAt(N - 1)}px`,
                animation: `${anim("lp-slide", REVEAL, 0, "linear")}, ${anim("lp-fade-out", 0.5, REVEAL, "ease")}`,
              } as CSSProperties
            }
          >
            <rect x={-28} y={PRICE_TOP - 8} width={28} height={EQ_BOTTOM - PRICE_TOP + 8} fill="url(#lp-scan)" />
            <line x1={0} x2={0} y1={PRICE_TOP - 8} y2={EQ_BOTTOM} stroke="var(--primary)" strokeWidth={1.5} />
            <circle cy={PRICE_TOP - 8} r={3} fill="var(--primary)" />
          </g>

          {/* End of the equity curve */}
          <g className="lp-anim" style={{ animation: anim("lp-fade-in", 0.4, REVEAL) }}>
            {!reduced && !exploring && (
              <circle
                className="lp-anim lp-box"
                cx={equityPoints[N - 1].x}
                cy={equityPoints[N - 1].y}
                r={6}
                fill="var(--primary)"
                opacity={0.3}
                style={{ animation: "lp-breathe 1.8s ease-in-out infinite" }}
              />
            )}
            <circle cx={equityPoints[N - 1].x} cy={equityPoints[N - 1].y} r={3.5} fill="var(--primary)" />
          </g>

          {hover !== null && <Crosshair index={hover} />}
        </svg>

        {hover !== null && <ExploreTooltip index={hover} />}
      </div>

      <figcaption className="flex flex-col gap-1 border-t px-4 py-3 text-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {t("Backtest real", "Real backtest")} · {snapshot.symbol}/USDT {data.timeframe} ·{" "}
          {dayRange(locale, data.from, data.to)} · {t("comisión", "fee")} {pct(locale, snapshot.feePct, { signed: false, digits: 1 })}
        </span>
        <span className="hidden sm:inline">{t("Pasa el cursor por el gráfico para explorarlo", "Hover the chart to explore it")}</span>
      </figcaption>
    </figure>
  )
}

function Crosshair({ index }: { index: number }) {
  const c = candles[index]
  const close = data.candles[index][3]
  return (
    <g pointerEvents="none">
      <line x1={c.x} x2={c.x} y1={PRICE_TOP - 8} y2={EQ_BOTTOM} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="3 3" />
      <circle cx={c.x} cy={yPrice(close)} r={3.5} fill="var(--card)" stroke="var(--foreground)" strokeWidth={1.5} />
      <circle cx={equityPoints[index].x} cy={equityPoints[index].y} r={3.5} fill="var(--card)" stroke="var(--primary)" strokeWidth={1.5} />
    </g>
  )
}

function ExploreTooltip({ index }: { index: number }) {
  const { locale, t } = useI18n()
  const [open, high, low, close] = data.candles[index]
  const holding = data.trades.some((trade) => index >= trade.entry && index < trade.exit)
  const left = (xAt(index) / W) * 100
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 flex min-w-44 -translate-x-1/2 flex-col gap-1 rounded-lg border bg-popover/95 px-3 py-2 text-caption shadow-lg backdrop-blur"
      style={{ left: `clamp(6rem, ${left}%, calc(100% - 6rem))` }}
    >
      <span className="flex items-center justify-between gap-3 font-semibold">
        {dayTime(locale, new Date(startMs + index * 4 * HOUR))} UTC
        {holding && (
          <span className="rounded bg-up-soft px-1.5 font-semibold text-up">{t("En posición", "In position")}</span>
        )}
      </span>
      <span className="num grid grid-cols-[auto_1fr] gap-x-3 text-muted-foreground">
        <span>O / C</span>
        <span className="text-right text-foreground">
          {num(locale, open)} / {num(locale, close)}
        </span>
        <span>H / L</span>
        <span className="text-right text-foreground">
          {num(locale, high)} / {num(locale, low)}
        </span>
        <span>{t("Capital", "Equity")}</span>
        <span className="text-right font-semibold text-foreground">{num(locale, data.equity[index])} USDT</span>
      </span>
    </div>
  )
}

export { ReplayArt }
