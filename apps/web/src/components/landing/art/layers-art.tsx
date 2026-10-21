"use client"

import { Fragment, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import {
  areaPath,
  clamp,
  easeInOutCubic,
  easeOutCubic,
  extent,
  lerp,
  linePath,
  linear,
  pad,
  phase,
  type Point,
} from "@/lib/landing/geometry"
import { snapshot } from "@/lib/landing/snapshot"
import { presetInfo } from "@/lib/preset-strategies"
import { cn } from "@/lib/utils"
import { monthRange, monthYear, num, pct } from "../format"
import { useClock, useShouldPlay, useWidth } from "../motion"

// A3 · "One backtest, four layers": a real price chart with its trades tilts into an exploded
// stack of glass panels that share its time axis (result per trade, equity, drawdown). A slice of
// light sweeps through every panel at once and reads all four at the same moment; the visitor can
// drive it with the pointer and point at each figure to get it explained.

const data = snapshot.metrics
const trades = data.trades
const capital = snapshot.initialCapital
const N = data.closes.length
const LAYERS = [0, 1, 2, 3] as const
const BACK_TO_FRONT = [3, 2, 1, 0] as const
const COLORS = ["var(--muted-foreground)", "var(--up)", "var(--primary)", "var(--down)"]

// ── Figures ──────────────────────────────────────────────────────────────────────────────────────
const stats = data.stats
const wins = trades.filter((tr) => tr.pnlPct > 0)
const losses = trades.filter((tr) => tr.pnlPct <= 0)
const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0)
const avgWin = mean(wins.map((tr) => tr.pnlPct))
const avgLoss = mean(losses.map((tr) => tr.pnlPct))
const buyHoldPct = (data.closes[N - 1] / data.closes[0] - 1) * 100
const HOURS: Record<string, number> = { m: 1 / 60, h: 1, d: 24, w: 168, M: 720 }
const hoursPerBar = Number.parseInt(data.timeframe, 10) * (HOURS[data.timeframe.replace(/^\d+/, "")] ?? 1)
const avgDays = (mean(trades.map((tr) => tr.bars)) * hoursPerBar) / 24

/** Drawdown (≤ 0, in %) of the account at each point. */
const drawdown: number[] = []
{
  let peak = capital
  for (const v of data.equity) {
    peak = Math.max(peak, v)
    drawdown.push((v / peak - 1) * 100)
  }
}
/** Last trade closed at or before each point (-1 = none yet). */
const lastClosed: number[] = []
{
  let k = -1
  for (let i = 0; i < N; i++) {
    while (k + 1 < trades.length && trades[k + 1].exit <= i) k++
    lastClosed.push(k)
  }
}
const fromTime = Date.parse(data.from)
const toTime = Date.parse(data.to)
const dateAt = (i: number) => new Date(lerp(fromTime, toTime, i / (N - 1)))

// ── Layouts ──────────────────────────────────────────────────────────────────────────────────────
// Each panel is drawn flat in its own W×H box and placed with an affine matrix. Its time axis stays
// horizontal, so a rise always looks like a rise (a sloped one would make every line look like it
// falls); its value axis leans back slightly (c, d) and every layer further back moves (dx, -dy).

type Layout = {
  mobile: boolean
  vbW: number
  vbH: number
  W: number
  H: number
  /** Screen x of the value axis per unit (a lean) and its vertical scale. */
  c: number
  d: number
  /** Top-left corner of the front panel. */
  x0: number
  y0: number
  dx: number
  dy: number
  /** Before unfolding: the front panel alone, upright, scaled by `s` with its corner at (x, y). */
  flat: { s: number; x: number; y: number }
  /** Column of the side labels (0 = no labels: they become tiles under the picture). */
  labelX: number
  font: number
}

const DESKTOP: Layout = {
  mobile: false,
  vbW: 1100,
  vbH: 456,
  W: 520,
  H: 108,
  c: -0.14,
  d: 0.97,
  x0: 52,
  y0: 312,
  dx: 56,
  dy: 96,
  flat: { s: 1.2, x: 238, y: 163 },
  labelX: 800,
  font: 11,
}

const MOBILE: Layout = {
  mobile: true,
  vbW: 380,
  vbH: 452,
  W: 290,
  H: 92,
  c: -0.1,
  d: 0.97,
  x0: 30,
  y0: 326,
  dx: 16,
  dy: 104,
  flat: { s: 1.1, x: 30, y: 175 },
  labelX: 0,
  font: 10,
}

type Pose = { a: number; c: number; d: number; x: number; y: number }

/** Matrix of panel `k`: `tilt` goes from upright (0) to the 3D view (1), `spread` pulls it back. */
function poseOf(L: Layout, k: number, tilt: number, spread: number): Pose {
  return {
    a: lerp(L.flat.s, 1, tilt),
    c: lerp(0, L.c, tilt),
    d: lerp(L.flat.s, L.d, tilt),
    x: lerp(L.flat.x, L.x0, tilt) + k * L.dx * spread,
    y: lerp(L.flat.y, L.y0, tilt) - k * L.dy * spread,
  }
}
const project = (p: Pose, u: number, w: number): Point => ({ x: p.x + p.a * u + p.c * w, y: p.y + p.d * w })
const matrix = (p: Pose) => `matrix(${p.a} 0 ${p.c} ${p.d} ${p.x} ${p.y})`

/** Static paths of the four panels for one layout, plus the y of each layer at a point. */
function buildGeometry(L: Layout) {
  const left = 12
  const right = L.W - 12
  const top = L.mobile ? 22 : 26
  const bottom = L.H - (L.mobile ? 10 : 14)
  const xAt = (i: number) => left + (i / (N - 1)) * (right - left)

  const priceRange = pad(extent(data.closes), 0.08)
  const yPrice = linear(priceRange[0], priceRange[1], bottom, top)
  const price = linePath(data.closes.map((v, i) => ({ x: xAt(i), y: yPrice(v) })))
  const zones = trades.map((tr) => ({
    x: xAt(tr.entry) - 1,
    width: Math.max(xAt(tr.exit) - xAt(tr.entry) + 2, 2.5),
    win: tr.pnlPct > 0,
  }))

  const zero = (top + bottom) / 2
  const maxAbs = Math.max(...trades.map((tr) => Math.abs(tr.pnlPct)), 1)
  const bars = trades.map((tr) => ({ x: xAt(tr.exit), h: (tr.pnlPct / maxAbs) * ((bottom - top) / 2), win: tr.pnlPct > 0 }))

  const buyHold = data.closes.map((c) => (c / data.closes[0]) * capital)
  const equityRange = pad(extent([...data.equity, ...buyHold]), 0.06)
  const yEquity = linear(equityRange[0], equityRange[1], bottom, top)
  const equityPoints = data.equity.map((v, i) => ({ x: xAt(i), y: yEquity(v) }))
  const equity = linePath(equityPoints)
  const equityArea = areaPath(equityPoints, bottom)
  const buyHoldLine = linePath(buyHold.map((v, i) => ({ x: xAt(i), y: yEquity(v) })))
  const yBase = yEquity(capital)

  const yDrawdown = linear(0, Math.min(...drawdown) * 1.08, top + 2, bottom)
  const drawdownPoints = drawdown.map((v, i) => ({ x: xAt(i), y: yDrawdown(v) }))

  return {
    left,
    right,
    top,
    bottom,
    xAt,
    zones,
    price,
    zero,
    bars,
    equity,
    equityArea,
    buyHoldLine,
    yBase,
    drawdownLine: linePath(drawdownPoints),
    drawdownArea: areaPath(drawdownPoints, yDrawdown(0)),
    yDrawdownZero: yDrawdown(0),
    /** y of layer `k` at point `i`. */
    yAt: (k: number, i: number) =>
      k === 0 ? yPrice(data.closes[i]) : k === 1 ? zero : k === 2 ? yEquity(data.equity[i]) : yDrawdown(drawdown[i]),
  }
}
const GEOMETRY = new Map<Layout, ReturnType<typeof buildGeometry>>([
  [DESKTOP, buildGeometry(DESKTOP)],
  [MOBILE, buildGeometry(MOBILE)],
])

// ── Timeline (seconds) ───────────────────────────────────────────────────────────────────────────
const UNFOLD = 0.6
const UNFOLD_DUR = 1.5
const STAGGER = 0.12
const FILL = 1.6
const LABEL = 1.9
const SCAN = 3.4
const SCAN_DUR = 7
const FOLD = 11.8
const FOLD_DUR = 1.5
const CYCLE = 14
/** The resting picture (server render, reduced motion, before it plays): unfolded, no slice. */
const REST = SCAN

type Frame = {
  tilt: number
  spread: number[]
  alpha: number[]
  fill: number[]
  label: number[]
  count: number[]
  /** Slice position, 0 → 1 along the time axis. */
  scan: number
  scanAlpha: number
}

const easeInOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2

function frameAt(t: number): Frame {
  const fold = phase(t, FOLD, FOLD_DUR)
  const tilt = easeInOutCubic(phase(t, UNFOLD, UNFOLD_DUR)) * (1 - easeInOutCubic(fold))
  return {
    tilt,
    spread: LAYERS.map(
      (k) =>
        easeInOutCubic(phase(t, UNFOLD + 0.1 + k * STAGGER, UNFOLD_DUR - 0.2)) *
        (1 - easeInOutCubic(phase(t, FOLD + (3 - k) * 0.08, FOLD_DUR - 0.25)))
    ),
    alpha: LAYERS.map((k) =>
      k === 0 ? 1 : phase(t, UNFOLD + 0.1 + k * STAGGER, 0.45) * (1 - phase(t, FOLD + FOLD_DUR - 0.45, 0.4))
    ),
    fill: LAYERS.map((k) => (k === 0 ? 1 : easeOutCubic(phase(t, FILL + 0.2 * k, 1)))),
    label: LAYERS.map((k) => phase(t, LABEL + 0.15 * k, 0.4) * (1 - phase(t, FOLD, 0.35))),
    count: LAYERS.map((k) => easeOutCubic(phase(t, LABEL + 0.15 * k, 1))),
    scan: easeInOutSine(phase(t, SCAN, SCAN_DUR)),
    scanAlpha: phase(t, SCAN, 0.35) * (1 - phase(t, SCAN + SCAN_DUR, 0.4)),
  }
}

/** Unfolded, with the slice where the visitor points. */
const exploredFrame = (scan: number): Frame => ({ ...frameAt(REST), scan, scanAlpha: 1 })

function LayersArt() {
  const { locale, t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useWidth(rootRef)
  const { play } = useShouldPlay(rootRef)
  // Slice driven by the pointer (null = the animation drives it).
  const [explore, setExplore] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const { time } = useClock(play && explore === null)

  const L = width > 0 && width < 640 ? MOBILE : DESKTOP
  const g = GEOMETRY.get(L)!
  const f = explore === null ? frameAt((time + REST) % CYCLE) : exploredFrame(explore)
  const poses = LAYERS.map((k) => poseOf(L, k, f.tilt, f.spread[k]))
  const finalPoses = LAYERS.map((k) => poseOf(L, k, 1, 1))
  const u = lerp(g.left, g.right, f.scan)
  const i = Math.round(f.scan * (N - 1))
  const active = hovered ?? pinned
  const dim = (k: number) => (active === null || active === k ? 1 : 0.28)

  const name = presetInfo["preset-medium"].name[locale]
  const layers = [
    {
      name: t("Precio y operaciones", "Price and trades"),
      value: (c: number) => `${Math.round(trades.length * c)} ${t("operaciones", "trades")}`,
      sub: t(`de media, ${num(locale, avgDays, 1)} días cada una`, `${num(locale, avgDays, 1)} days each on average`),
      tone: "",
      explain: t(
        "Cada franja es una operación, de la compra a la venta: verde si ganó, roja si perdió.",
        "Each band is one trade, from the buy to the sell: green if it won, red if it lost."
      ),
    },
    {
      name: t("Resultado por operación", "Result per trade"),
      value: (c: number) => `${pct(locale, stats.winRatePct * c, { signed: false, digits: 0 })} ${t("ganadoras", "winners")}`,
      sub: t(
        `de media ${pct(locale, avgWin, { digits: 1 })} / ${pct(locale, avgLoss, { digits: 1 })}`,
        `average ${pct(locale, avgWin, { digits: 1 })} / ${pct(locale, avgLoss, { digits: 1 })}`
      ),
      tone: "",
      explain:
        avgWin > -avgLoss && stats.winRatePct < 50
          ? t(
              "Cada barra es una operación cerrada. Aquí ganan pocas, pero cada ganadora vale por varias perdedoras.",
              "Each bar is a closed trade. Few win here, but each winner is worth several losers."
            )
          : t("Cada barra es una operación cerrada, con comisiones incluidas.", "Each bar is a closed trade, fees included."),
    },
    {
      name: t("Curva de capital", "Equity curve"),
      value: (c: number) => pct(locale, stats.returnPct * c, { digits: 1 }),
      sub: t(`comprar y mantener: ${pct(locale, buyHoldPct, { digits: 1 })}`, `buy & hold: ${pct(locale, buyHoldPct, { digits: 1 })}`),
      tone: stats.returnPct >= 0 ? "var(--up)" : "var(--down)",
      explain: t(
        "Lo que vale tu dinero en cada momento, comisiones incluidas. La línea discontinua es lo que habrías tenido comprando y manteniendo.",
        "What your money is worth at every moment, fees included. The dashed line is what you'd have had by buying and holding."
      ),
    },
    {
      name: "Drawdown",
      value: (c: number) => pct(locale, -stats.maxDrawdownPct * c, { digits: 1 }),
      sub: t("peor caída desde un máximo", "worst fall from a peak"),
      tone: "var(--down)",
      explain: t(
        "Cuánto llegó a caer la cuenta desde su último máximo: lo que habrías tenido que aguantar sin vender.",
        "How far the account fell from its last peak: what you would have had to sit through without selling."
      ),
    },
  ]

  // Readings of the slice on each layer.
  const closed = lastClosed[i]
  const readings = [
    `${num(locale, data.closes[i])} USDT`,
    closed >= 0 ? `${t("Op.", "Trade")} ${closed + 1} · ${pct(locale, trades[closed].pnlPct, { digits: 1 })}` : "",
    pct(locale, (data.equity[i] / capital - 1) * 100, { digits: 1 }),
    pct(locale, drawdown[i], { digits: 1 }),
  ]
  const readingTone = [
    "var(--foreground)",
    closed >= 0 ? (trades[closed].pnlPct > 0 ? "var(--up)" : "var(--down)") : "var(--foreground)",
    data.equity[i] >= capital ? "var(--up)" : "var(--down)",
    drawdown[i] < 0 ? "var(--down)" : "var(--foreground)",
  ]

  const stackRight = L.x0 + 3 * L.dx + L.W
  const onPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" && event.type === "pointermove" && event.buttons === 0) return
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    if (L.labelX && p.x > stackRight + 24) {
      setExplore(null)
      return
    }
    // Read the time axis through the middle of the stack.
    const origin = L.x0 + 1.5 * L.dx + (L.c * L.H) / 2 + g.left
    setExplore(clamp((p.x - origin) / (g.right - g.left)))
  }
  const stopExplore = () => setExplore(null)

  const pill = (k: number, at: Point, text: string, color: string, alpha: number) => {
    if (!text) return null
    const w = text.length * (L.font * 0.58) + 14
    const h = L.font + 9
    const x = f.scan > 0.62 ? at.x - 10 - w : at.x + 10
    return (
      <g key={`pill-${k}`} opacity={alpha * dim(k)}>
        <rect x={x} y={at.y - h / 2} width={w} height={h} rx={h / 2} fill="var(--popover)" stroke="var(--border-strong)" />
        <text x={x + w / 2} y={at.y + L.font * 0.36} textAnchor="middle" fontSize={L.font} fontWeight={600} fill={color} className="num">
          {text}
        </text>
      </g>
    )
  }

  const labelProps = (k: number) => ({
    onPointerEnter: () => setHovered(k),
    onPointerLeave: () => setHovered(null),
    onFocus: () => setHovered(k),
    onBlur: () => setHovered(null),
    onClick: () => setPinned((p) => (p === k ? null : k)),
    "aria-pressed": pinned === k,
  })

  const hint = L.mobile
    ? t("Desliza el dedo sobre las capas para recorrer el tiempo y toca una cifra para saber qué significa.", "Drag your finger across the layers to travel through time, and tap a figure to see what it means.")
    : t("Pasa el cursor por las capas para recorrer el tiempo, o por una cifra para saber qué significa.", "Move the pointer across the layers to travel through time, or over a figure to see what it means.")

  return (
    <div ref={rootRef} className="flex flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="truncate font-semibold">
          {snapshot.symbol}/USDT · {data.timeframe} · <span className="text-muted-foreground">{name}</span>
        </span>
        <span className="num shrink-0 text-caption font-semibold text-muted-foreground">
          {monthRange(locale, data.from, data.to)}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${L.vbW} ${L.vbH}`}
        className="block h-auto w-full touch-pan-y select-none"
        role="group"
        aria-label={t(
          `Backtest de ${name} en ${snapshot.symbol} ${data.timeframe} separado en cuatro capas: ${trades.length} operaciones, ${pct(locale, stats.winRatePct, { signed: false, digits: 0 })} ganadoras, rentabilidad ${pct(locale, stats.returnPct, { digits: 1 })} y drawdown máximo ${pct(locale, -stats.maxDrawdownPct, { digits: 1 })}.`,
          `${name} backtest on ${snapshot.symbol} ${data.timeframe} split into four layers: ${trades.length} trades, ${pct(locale, stats.winRatePct, { signed: false, digits: 0 })} winners, ${pct(locale, stats.returnPct, { digits: 1 })} return and ${pct(locale, -stats.maxDrawdownPct, { digits: 1 })} max drawdown.`
        )}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={stopExplore}
        onPointerCancel={stopExplore}
        onPointerUp={(event) => event.pointerType === "touch" && stopExplore()}
      >
        <defs>
          <linearGradient id="lp-layers-slice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.24" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0.05" />
          </linearGradient>
          {LAYERS.slice(1).map((k) => (
            <clipPath key={k} id={`lp-layers-fill-${k}`}>
              <rect x={0} y={0} width={g.left + (g.right - g.left) * f.fill[k]} height={L.H} />
            </clipPath>
          ))}
        </defs>

        {BACK_TO_FRONT.map((k) => {
          const p = poses[k]
          const focused = active === k
          const behind = k > 0 ? poses[k - 1] : null
          return (
            <Fragment key={k}>
              <g opacity={dim(k)} style={{ transition: "opacity 220ms ease" }}>
                <g transform={matrix(p)} opacity={f.alpha[k]}>
                  <rect x={5} y={10} width={L.W} height={L.H} rx={12} fill="var(--foreground)" opacity={0.05} />
                  <rect
                    width={L.W}
                    height={L.H}
                    rx={12}
                    fill="var(--card)"
                    fillOpacity={0.9}
                    stroke={focused ? "var(--primary)" : "var(--border-strong)"}
                    strokeWidth={focused ? 1.6 : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text x={12} y={L.mobile ? 14 : 17} fontSize={L.font - 1} fill="var(--muted-foreground)" fontWeight={600}>
                    <tspan fill={COLORS[k]} fontWeight={700} className="num">
                      {`0${k + 1}`}
                    </tspan>
                    {`  ${layers[k].name}`}
                  </text>
                  <g clipPath={k ? `url(#lp-layers-fill-${k})` : undefined}>
                    <PanelContent k={k} g={g} />
                  </g>
                  {f.scanAlpha > 0 && (
                    <line
                      x1={u}
                      x2={u}
                      y1={6}
                      y2={L.H - 6}
                      stroke="var(--primary)"
                      strokeWidth={1.5}
                      opacity={f.scanAlpha}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              </g>
              {behind && f.scanAlpha > 0 && (
                <Slice
                  points={[project(p, u, 0), project(behind, u, 0), project(behind, u, L.H), project(p, u, L.H)]}
                  alpha={f.scanAlpha}
                />
              )}
            </Fragment>
          )
        })}

        {f.scanAlpha > 0 &&
          LAYERS.map((k) => {
            const at = project(poses[k], u, g.yAt(k, i))
            return (
              <g key={k} opacity={f.scanAlpha * dim(k)}>
                <circle cx={at.x} cy={at.y} r={L.mobile ? 3.5 : 4.5} fill={k === 1 ? readingTone[1] : COLORS[k]} stroke="var(--card)" strokeWidth={2} />
              </g>
            )
          })}
        {f.scanAlpha > 0 && LAYERS.map((k) => pill(k, project(poses[k], u, g.yAt(k, i)), readings[k], readingTone[k], f.scanAlpha))}
        {f.scanAlpha > 0 &&
          (() => {
            const at = project(poses[0], u, L.H)
            const text = monthYear(locale, dateAt(i))
            const w = text.length * (L.font * 0.6) + 16
            return (
              <g opacity={f.scanAlpha}>
                <rect x={at.x - w / 2} y={at.y + 8} width={w} height={L.font + 9} rx={(L.font + 9) / 2} fill="var(--primary)" />
                <text x={at.x} y={at.y + 8 + (L.font + 9) / 2 + L.font * 0.36} textAnchor="middle" fontSize={L.font} fontWeight={700} fill="var(--primary-foreground)">
                  {text}
                </text>
              </g>
            )
          })()}

        {L.labelX > 0 &&
          LAYERS.map((k) => {
            const start = project(poses[k], L.W, L.H / 2)
            const y = project(finalPoses[k], L.W, L.H / 2).y
            const focused = active === k
            const c = f.count[k]
            return (
              <g key={k} opacity={f.label[k]}>
                <line x1={start.x + 4} y1={start.y} x2={L.labelX - 18} y2={y} stroke="var(--border-strong)" strokeDasharray="3 4" />
                <circle cx={start.x} cy={start.y} r={3} fill={COLORS[k]} />
                <g
                  transform={`translate(${L.labelX} ${y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${layers[k].name}: ${layers[k].value(1)}. ${layers[k].explain}`}
                  className="cursor-pointer outline-none"
                  {...labelProps(k)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    setPinned((p) => (p === k ? null : k))
                  }}
                >
                  <rect
                    x={-14}
                    y={-36}
                    width={286}
                    height={72}
                    rx={12}
                    fill={focused ? "var(--muted)" : "transparent"}
                    stroke={pinned === k ? "var(--primary)" : "transparent"}
                    style={{ transition: "fill 200ms ease" }}
                  />
                  <circle cx={0} cy={-18} r={3.5} fill={COLORS[k]} />
                  <text x={10} y={-14} fontSize={11.5} fontWeight={600} fill={focused ? "var(--foreground)" : "var(--muted-foreground)"}>
                    {layers[k].name}
                  </text>
                  <text y={10} fontSize={22} fontWeight={700} fill={layers[k].tone || "var(--foreground)"} className="num" letterSpacing={-0.4}>
                    {layers[k].value(c)}
                  </text>
                  <text y={28} fontSize={11} fill="var(--muted-foreground)" className="num">
                    {layers[k].sub}
                  </text>
                </g>
              </g>
            )
          })}
      </svg>

      {L.mobile && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-1">
          {LAYERS.map((k) => (
            <button
              key={k}
              type="button"
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
                active === k ? "border-primary bg-muted" : "bg-card"
              )}
              {...labelProps(k)}
            >
              <span className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ background: COLORS[k] }} />
                {layers[k].name}
              </span>
              <span className="num font-bold" style={{ color: layers[k].tone || undefined }}>
                {layers[k].value(1)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t px-4 py-3">
        <p aria-live="polite" className={cn("min-h-10 text-caption", active === null ? "text-muted-foreground" : "text-foreground")}>
          {active === null ? hint : layers[active].explain}
        </p>
        <p className="num text-caption text-muted-foreground">
          {t("Backtest real", "Real backtest")} · {t("comisiones", "fees")} {pct(locale, snapshot.feePct, { signed: false, digits: 1 })}{" "}
          {t("incluidas", "included")} · Sharpe {num(locale, stats.sharpe, 2)}
          {stats.openPosition && ` · ${t("posición abierta al final", "position still open at the end")}`}
        </p>
      </div>
    </div>
  )
}

/** Contents of panel `k`, in its own W×H box. */
function PanelContent({ k, g }: { k: number; g: ReturnType<typeof buildGeometry> }) {
  if (k === 0)
    return (
      <>
        {g.zones.map((zone, n) => (
          <rect
            key={n}
            x={zone.x}
            y={g.top - 2}
            width={zone.width}
            height={g.bottom - g.top + 4}
            rx={1.5}
            fill={zone.win ? "var(--up)" : "var(--down)"}
            opacity={0.16}
          />
        ))}
        <path d={g.price} fill="none" stroke="var(--foreground)" strokeOpacity={0.8} strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </>
    )
  if (k === 1)
    return (
      <>
        <line x1={g.left} x2={g.right} y1={g.zero} y2={g.zero} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        {g.bars.map((bar, n) => (
          <rect
            key={n}
            x={bar.x - 1.6}
            y={bar.h > 0 ? g.zero - bar.h : g.zero}
            width={3.2}
            height={Math.max(Math.abs(bar.h), 1.5)}
            rx={1}
            fill={bar.win ? "var(--up)" : "var(--down)"}
          />
        ))}
      </>
    )
  if (k === 2)
    return (
      <>
        <path d={g.equityArea} fill="var(--primary)" opacity={0.1} />
        <line x1={g.left} x2={g.right} y1={g.yBase} y2={g.yBase} stroke="var(--muted-foreground)" strokeOpacity={0.35} strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
        <path d={g.buyHoldLine} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.7} strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <path d={g.equity} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </>
    )
  return (
    <>
      <line x1={g.left} x2={g.right} y1={g.yDrawdownZero} y2={g.yDrawdownZero} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <path d={g.drawdownArea} fill="var(--down)" opacity={0.16} />
      <path d={g.drawdownLine} fill="none" stroke="var(--down)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </>
  )
}

/** The slice of light between two panels at the same moment: a parallelogram from `from` back to `to`. */
function Slice({ points, alpha }: { points: [Point, Point, Point, Point]; alpha: number }) {
  const [from, to, toBottom, fromBottom] = points
  return (
    <g opacity={alpha} pointerEvents="none">
      <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="url(#lp-layers-slice)" />
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--primary)" strokeOpacity={0.45} />
      <line x1={fromBottom.x} y1={fromBottom.y} x2={toBottom.x} y2={toBottom.y} stroke="var(--primary)" strokeOpacity={0.25} />
    </g>
  )
}

export { LayersArt }
