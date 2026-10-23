"use client"

import { useMemo, useRef, useState } from "react"
import {
  ActivityIcon,
  BarChart3Icon,
  CircleDollarSignIcon,
  MousePointer2Icon,
  RotateCcwIcon,
  TrendingUpIcon,
  WavesIcon,
  type LucideIcon,
} from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { nodeStyles } from "@/components/strategy/builder/builder-node"
import {
  clamp,
  cubicLength,
  cubicPoint,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  extent,
  lerp,
  linePath,
  linear,
  pad,
  phase,
  slotX,
  wireControls,
  type Point,
} from "@/lib/chart-geometry"
import { snapshot } from "@/lib/landing/snapshot"
import { specOf, type Condition } from "@/lib/strategy"
import { cn } from "@/lib/utils"
import { monthRange, num } from "../format"
import { useClock, useShouldPlay, useWidth } from "@/lib/motion"

// A2 · "Live builder": an illustrated version of the visual strategy editor. A cursor drags two
// conditions in, wires them to a buy, a signal runs through the wires and the rule is written out
// in plain words, with the candles of a real year where it would have bought. Afterwards the AND/OR
// switch is live: flipping it rewrites the sentence and the signals.

type Rect = { x: number; y: number; w: number; h: number }
type Layout = {
  w: number
  h: number
  /** Wires leave/enter nodes horizontally (desktop) or vertically (mobile). */
  dir: "h" | "v"
  palette: Rect | null
  items: Rect[]
  price: Rect
  rsi: Rect
  bb: Rect
  buy: Rect
}

const desktop: Layout = {
  w: 900,
  h: 300,
  dir: "h",
  palette: { x: 0, y: 22, w: 172, h: 256 },
  items: [0, 1, 2, 3].map((i) => ({ x: 12, y: 62 + i * 52, w: 148, h: 42 })),
  price: { x: 214, y: 114, w: 196, h: 72 },
  rsi: { x: 456, y: 30, w: 196, h: 72 },
  bb: { x: 456, y: 198, w: 196, h: 72 },
  buy: { x: 704, y: 114, w: 196, h: 72 },
}

const mobile: Layout = {
  w: 340,
  h: 430,
  dir: "v",
  palette: null,
  items: [
    { x: 0, y: 0, w: 72, h: 40 },
    { x: 78, y: 0, w: 108, h: 40 },
    { x: 192, y: 0, w: 72, h: 40 },
    { x: 270, y: 0, w: 70, h: 40 },
  ],
  price: { x: 72, y: 74, w: 196, h: 64 },
  rsi: { x: 0, y: 200, w: 162, h: 76 },
  bb: { x: 178, y: 200, w: 162, h: 76 },
  buy: { x: 72, y: 344, w: 196, h: 64 },
}

/** Seconds of the choreography. */
const T = {
  price: 0.2,
  move1: 0.6,
  grab1: 1.2,
  drop1: 2.3,
  wire1: 2.45,
  move2: 2.8,
  grab2: 3.4,
  drop2: 4.5,
  wire2: 4.65,
  buy: 5.0,
  port1: 5.35,
  link1: 5.8,
  port2: 6.55,
  link2: 7.0,
  and: 7.7,
  signal: 7.95,
  type: 8.6,
  strip: 9.0,
  hint: 10.6,
  end: 11.6,
}
const LINK = 0.65
const SIGNAL_LEG = 0.55
const PULSE_EVERY = 4.5

const RSI: Condition = { kind: "rsi", period: 14, op: "below", value: 30 }
const BB: Condition = { kind: "bollinger", period: 20, stdDev: 2, band: "lower" }

const strip = snapshot.builder
const STRIP_W = 600
const STRIP_H = 72
const stripY = (() => {
  const [lo, hi] = pad(extent(strip.closes), 0.08)
  return linear(lo, hi, STRIP_H - 18, 6)
})()
const stripX = (i: number) => slotX(i, strip.closes.length, 0, STRIP_W)
const stripLine = linePath(strip.closes.map((v, i) => ({ x: stripX(i), y: stripY(v) })))

const lerpRect = (a: Rect, b: Rect, u: number): Rect => ({
  x: lerp(a.x, b.x, u),
  y: lerp(a.y, b.y, u),
  w: lerp(a.w, b.w, u),
  h: lerp(a.h, b.h, u),
})
const outPort = (r: Rect, dir: Layout["dir"]): Point =>
  dir === "h" ? { x: r.x + r.w, y: r.y + r.h / 2 } : { x: r.x + r.w / 2, y: r.y + r.h }
const inPort = (r: Rect, dir: Layout["dir"]): Point =>
  dir === "h" ? { x: r.x, y: r.y + r.h / 2 } : { x: r.x + r.w / 2, y: r.y }
/** Where the cursor holds a node or palette item: near its icon. */
const grip = (r: Rect): Point => ({ x: r.x + 26, y: r.y + r.h / 2 + 4 })

function BuilderArt() {
  const { locale, t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const { play, reduced } = useShouldPlay(ref)
  const { time, reset } = useClock(play)
  const [mode, setMode] = useState<"and" | "or">("and")
  const [changedAt, setChangedAt] = useState(0)
  const [toggled, setToggled] = useState(false)

  const layout = width > 0 && width < 640 ? mobile : desktop
  const scale = width > 0 ? Math.min(1, width / layout.w) : 1
  const { dir } = layout

  /** Progress of a step, already complete when motion is reduced. */
  const ph = (start: number, duration: number) => (reduced ? 1 : phase(time, start, duration))

  const wires = useMemo(() => {
    const make = (from: Rect, to: Rect) => {
      const controls = wireControls(outPort(from, dir), inPort(to, dir), dir)
      return { controls, length: cubicLength(...controls) }
    }
    return {
      priceRsi: make(layout.price, layout.rsi),
      priceBb: make(layout.price, layout.bb),
      rsiBuy: make(layout.rsi, layout.buy),
      bbBuy: make(layout.bb, layout.buy),
    }
  }, [layout, dir])

  // Dragged conditions: from their palette item to their place, growing into a node.
  const dragged = (item: Rect, target: Rect, grab: number, drop: number) => {
    if (!reduced && time < grab) return null
    const u = easeInOutCubic(ph(grab + 0.12, drop - grab - 0.12))
    const rect = lerpRect(item, target, u)
    const settle = ph(drop, 0.35)
    const lifted = !reduced && time < drop
    return { rect, lifted, scale: lifted ? 1.03 : lerp(1.04, 1, easeOutBack(settle)), tilt: lifted ? -2 * (1 - u) : 0 }
  }
  const rsiNode = dragged(layout.items[0], layout.rsi, T.grab1, T.drop1)
  const bbNode = dragged(layout.items[1], layout.bb, T.grab2, T.drop2)

  // Live wires dragged from a condition's port to the buy node.
  const link = (wire: { controls: [Point, Point, Point, Point] }, start: number) => {
    const u = easeInOutCubic(ph(start, LINK))
    if (u >= 1) return { done: true, end: wire.controls[3] }
    const from = wire.controls[0]
    const to = wire.controls[3]
    // While dragging, the loose end follows the cursor along a gentle curve to the input port.
    const end = { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) - Math.sin(u * Math.PI) * 18 }
    return { done: false, end }
  }
  const link1 = link(wires.rsiBuy, T.link1)
  const link2 = link(wires.bbBuy, T.link2)

  // Cursor path: a list of waypoints, eased between them.
  const cursor = (() => {
    const it = layout.items
    const p = (r: Rect) => grip(r)
    const offStage = { x: layout.w * 0.32, y: layout.h * 0.92 }
    const switchAt = dir === "h" ? { x: layout.buy.x - 14, y: layout.buy.y + layout.buy.h / 2 + 6 } : { x: layout.buy.x + layout.buy.w / 2 + 4, y: layout.buy.y - 6 }
    const way: [number, Point][] = [
      [0, offStage],
      [T.move1, offStage],
      [T.grab1, p(it[0])],
      [T.grab1 + 0.12, p(it[0])],
      [T.drop1, p(layout.rsi)],
      [T.move2, p(layout.rsi)],
      [T.grab2, p(it[1])],
      [T.grab2 + 0.12, p(it[1])],
      [T.drop2, p(layout.bb)],
      [T.port1, outPort(layout.rsi, dir)],
      [T.link1, outPort(layout.rsi, dir)],
      [T.link1 + LINK, inPort(layout.buy, dir)],
      [T.port2, outPort(layout.bb, dir)],
      [T.link2, outPort(layout.bb, dir)],
      [T.link2 + LINK, inPort(layout.buy, dir)],
      [T.hint - 0.6, inPort(layout.buy, dir)],
      [T.hint, switchAt],
    ]
    let k = 0
    while (k < way.length - 1 && time >= way[k + 1][0]) k++
    if (k === way.length - 1) return way[k][1]
    const [t0, a] = way[k]
    const [t1, b] = way[k + 1]
    const u = easeInOutCubic(clamp((time - t0) / (t1 - t0)))
    // Long moves arc a little, like a hand would.
    const arc = Math.sin(u * Math.PI) * Math.min(Math.hypot(b.x - a.x, b.y - a.y) * 0.08, 18)
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) - arc }
  })()
  const pressing =
    (time >= T.grab1 && time < T.drop1) ||
    (time >= T.grab2 && time < T.drop2) ||
    (time >= T.link1 && time < T.link1 + LINK) ||
    (time >= T.link2 && time < T.link2 + LINK)
  const cursorOpacity = reduced ? 0 : Math.min(ph(0.3, 0.3), 1 - ph(T.end + 0.4, 0.4))

  // Signal pulses: the scripted one, then one every few seconds and one after every switch.
  const pulseStart = (() => {
    if (reduced) return null
    const since = Math.max(T.signal, changedAt)
    if (time < since) return null
    const ambient = time >= T.end + 1 ? T.end + 1 + Math.floor((time - T.end - 1) / PULSE_EVERY) * PULSE_EVERY : since
    return Math.max(since, ambient)
  })()
  const leg1 = pulseStart === null ? -1 : phase(time, pulseStart, SIGNAL_LEG)
  const leg2 = pulseStart === null ? -1 : phase(time, pulseStart + SIGNAL_LEG, SIGNAL_LEG)
  const buyGlow = pulseStart === null ? 0 : Math.sin(Math.PI * phase(time, pulseStart + SIGNAL_LEG * 2, 0.7))

  const andShown = easeOutBack(ph(T.and, 0.4))
  const buyIn = easeOutBack(ph(T.buy, 0.45))
  const priceIn = easeOutBack(ph(T.price, 0.45))
  const interactive = reduced || time >= T.and

  // The rule in plain words, typed out.
  const join = mode === "and" ? t("y", "and") : t("o", "or")
  const parts = [
    { text: t("Compra cuando el ", "Buy when the ") },
    { text: t("RSI (14) está por debajo de 30", "RSI (14) is below 30"), strong: true },
    { text: ` ${join} `, join: true },
    { text: t("el cierre queda bajo la banda inferior de Bollinger", "the close is below the lower Bollinger Band"), strong: true },
    { text: "." },
  ]
  const total = parts.reduce((n, p) => n + p.text.length, 0)
  const typed = Math.floor(total * ph(T.type, 1.8))
  let left = typed

  const signals = mode === "and" ? strip.and : strip.or
  const count = mode === "and" ? strip.andCount : strip.orCount
  const previous = mode === "and" ? strip.orCount : strip.andCount
  const markerBase = Math.max(T.strip, changedAt)
  const countShown = changedAt > 0 ? Math.round(lerp(previous, count, easeOutCubic(ph(changedAt, 0.7)))) : count
  const stripIn = ph(T.strip, 0.5)

  const toggle = () => {
    setMode((m) => (m === "and" ? "or" : "and"))
    setChangedAt(reduced ? 0 : time)
    setToggled(true)
  }
  const replay = () => {
    reset()
    setMode("and")
    setChangedAt(0)
    setToggled(false)
  }

  const wireColor = mode === "and" ? "var(--primary)" : "var(--chart-4)"
  const wireStroke = (wire: { length: number }, start: number, color: string) => ({
    stroke: color,
    strokeDasharray: wire.length,
    strokeDashoffset: wire.length * (1 - easeInOutCubic(ph(start, 0.45))),
  })

  const nodeText = {
    price: { kicker: t("Entrada", "Input"), title: t("Precio de cierre", "Close price"), subtitle: t("de cada vela", "of every candle") },
    rsi: { kicker: t("Indicador", "Indicator"), title: specOf(RSI).name[locale], subtitle: specOf(RSI).describe(RSI, locale) },
    bb: { kicker: t("Indicador", "Indicator"), title: specOf(BB).name[locale], subtitle: specOf(BB).describe(BB, locale) },
    buy: { kicker: t("Acción", "Action"), title: t("Compra", "Buy"), subtitle: t("100 % del efectivo", "100% of the cash") },
  }
  const paletteItems: { label: string; Icon: LucideIcon }[] = [
    { label: "RSI", Icon: ActivityIcon },
    { label: "Bollinger", Icon: WavesIcon },
    { label: "MACD", Icon: BarChart3Icon },
    { label: t("Medias", "MAs"), Icon: TrendingUpIcon },
  ]

  const dot = (wire: { controls: [Point, Point, Point, Point] }, u: number, color: string, key: string) =>
    u > 0 && u < 1 ? <SignalDot key={key} at={cubicPoint(...wire.controls, easeInOutCubic(u))} color={color} /> : null

  return (
    <div className="flex flex-col gap-5">
      <div ref={ref} className="relative w-full" style={{ height: width > 0 ? layout.h * scale : desktop.h }}>
        {width > 0 && (
          <div
            className="absolute top-0 left-1/2 origin-top"
            style={{ width: layout.w, height: layout.h, transform: `translateX(-50%) scale(${scale})` }}
          >
            {/* Palette */}
            {layout.palette && (
              <div
                className="absolute rounded-2xl border bg-card/70 shadow-sm"
                style={{ left: layout.palette.x, top: layout.palette.y, width: layout.palette.w, height: layout.palette.h }}
              >
                <span className="absolute top-3.5 left-3.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("Condiciones", "Conditions")}
                </span>
              </div>
            )}
            {layout.items.map((item, i) => {
              const { label, Icon } = paletteItems[i]
              const active = (i === 0 && rsiNode?.lifted) || (i === 1 && bbNode?.lifted)
              return (
                <div
                  key={label}
                  className={cn(
                    "absolute flex items-center gap-2 rounded-xl border bg-card px-2.5 text-body font-semibold transition-colors",
                    active ? "border-primary bg-accent text-accent-foreground" : "text-foreground"
                  )}
                  style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="truncate">{label}</span>
                </div>
              )
            })}

            {/* Wires */}
            <svg className="absolute inset-0 overflow-visible" width={layout.w} height={layout.h} aria-hidden>
              <g fill="none" strokeWidth={2} strokeLinecap="round">
                {(reduced || time >= T.wire1) && (
                  <path d={pathOf(wires.priceRsi.controls)} {...wireStroke(wires.priceRsi, T.wire1, "var(--border-strong)")} />
                )}
                {(reduced || time >= T.wire2) && (
                  <path d={pathOf(wires.priceBb.controls)} {...wireStroke(wires.priceBb, T.wire2, "var(--border-strong)")} />
                )}
                {(reduced || time >= T.link1) && (
                  <path
                    d={link1.done ? pathOf(wires.rsiBuy.controls) : pathOf(wireControls(wires.rsiBuy.controls[0], link1.end, dir))}
                    stroke={wireColor}
                    strokeOpacity={0.7}
                    className="transition-[stroke] duration-500"
                  />
                )}
                {(reduced || time >= T.link2) && (
                  <path
                    d={link2.done ? pathOf(wires.bbBuy.controls) : pathOf(wireControls(wires.bbBuy.controls[0], link2.end, dir))}
                    stroke={wireColor}
                    strokeOpacity={0.7}
                    className="transition-[stroke] duration-500"
                  />
                )}
              </g>
              {dot(wires.priceRsi, leg1, "var(--primary)", "a")}
              {dot(wires.priceBb, leg1, "var(--primary)", "b")}
              {dot(wires.rsiBuy, leg2, mode === "and" ? "var(--primary)" : "var(--chart-4)", "c")}
              {dot(wires.bbBuy, leg2, mode === "and" ? "var(--primary)" : "var(--chart-4)", "d")}
            </svg>

            {/* Nodes */}
            <FlowNode
              rect={layout.price}
              dir={dir}
              kind="price"
              Icon={CircleDollarSignIcon}
              text={nodeText.price}
              style={{ opacity: clamp(priceIn * 1.4), transform: `scale(${lerp(0.9, 1, priceIn)})` }}
              ports={{ out: true }}
            />
            {rsiNode && (
              <FlowNode
                rect={rsiNode.rect}
                dir={dir}
                kind="condition"
                Icon={ActivityIcon}
                text={nodeText.rsi}
                compact={rsiNode.lifted}
                lifted={rsiNode.lifted}
                style={{ transform: `rotate(${rsiNode.tilt}deg) scale(${rsiNode.scale})` }}
                ports={rsiNode.lifted ? {} : { in: true, out: true }}
              />
            )}
            {bbNode && (
              <FlowNode
                rect={bbNode.rect}
                dir={dir}
                kind="condition"
                Icon={WavesIcon}
                text={nodeText.bb}
                compact={bbNode.lifted}
                lifted={bbNode.lifted}
                style={{ transform: `rotate(${bbNode.tilt}deg) scale(${bbNode.scale})` }}
                ports={bbNode.lifted ? {} : { in: true, out: true }}
              />
            )}
            {(reduced || time >= T.buy) && (
              <FlowNode
                rect={layout.buy}
                dir={dir}
                kind="buy"
                Icon={TrendingUpIcon}
                text={nodeText.buy}
                glow={buyGlow}
                style={{ opacity: clamp(buyIn * 1.4), transform: `scale(${lerp(0.85, 1, buyIn)})` }}
                ports={{ in: andShown <= 0 }}
              />
            )}

            {/* AND / OR switch where the wires meet */}
            {andShown > 0 && (
              <button
                type="button"
                onClick={toggle}
                disabled={!interactive}
                aria-pressed={mode === "or"}
                aria-label={t(
                  `Combinar condiciones: ${mode === "and" ? "Y (las dos)" : "O (cualquiera)"}. Pulsa para cambiar`,
                  `Combine conditions: ${mode === "and" ? "AND (both)" : "OR (either)"}. Press to switch`
                )}
                className={cn(
                  "absolute flex h-7 min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 bg-card px-2 text-caption font-bold shadow-sm transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40",
                  mode === "and" ? "border-primary text-primary" : "border-chart-4 text-chart-4"
                )}
                style={{
                  left: inPort(layout.buy, dir).x,
                  top: inPort(layout.buy, dir).y,
                  scale: String(andShown),
                }}
              >
                {mode === "and" ? t("Y", "AND") : t("O", "OR")}
              </button>
            )}
            {!toggled && interactive && !reduced && (
              <span
                className="pointer-events-none absolute -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-caption font-semibold whitespace-nowrap text-background shadow-md"
                style={{
                  left: inPort(layout.buy, dir).x,
                  top: inPort(layout.buy, dir).y + (dir === "h" ? 26 : -48),
                  opacity: ph(T.hint, 0.4),
                }}
              >
                {t("Pulsa para cambiar Y / O", "Click to switch AND / OR")}
              </span>
            )}

            {/* Cursor */}
            {cursorOpacity > 0 && (
              <MousePointer2Icon
                aria-hidden
                className="pointer-events-none absolute size-6 fill-foreground stroke-background drop-shadow-md"
                strokeWidth={1.5}
                style={{
                  left: cursor.x - 4,
                  top: cursor.y - 3,
                  opacity: cursorOpacity,
                  transform: `scale(${pressing ? 0.86 : 1})`,
                  transition: "transform 120ms ease-out",
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* The rule in words + where it would have bought */}
      <div className="grid gap-4 rounded-2xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:gap-6">
        <p className="min-h-[3.5rem] text-lead text-foreground" aria-live="polite">
          {parts.map((part, i) => {
            const shown = part.text.slice(0, Math.max(0, left))
            left -= part.text.length
            if (!shown) return null
            return (
              <span
                key={i}
                className={cn(
                  part.strong && "font-semibold",
                  part.join && (mode === "and" ? "font-bold text-primary" : "font-bold text-chart-4")
                )}
              >
                {shown}
              </span>
            )
          })}
          {typed < total && typed > 0 && <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-primary" />}
        </p>
        <div className="flex flex-col gap-1.5" style={{ opacity: stripIn }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-caption font-semibold text-muted-foreground">
              {snapshot.symbol}/USDT {strip.timeframe} · {monthRange(locale, strip.from, strip.to)}
            </span>
            <span className="num text-caption">
              <span className={cn("text-title font-bold", mode === "and" ? "text-primary" : "text-chart-4")}>
                {num(locale, countShown)}
              </span>{" "}
              <span className="text-muted-foreground">{t("velas con señal de compra", "candles with a buy signal")}</span>
            </span>
          </div>
          <svg viewBox={`0 0 ${STRIP_W} ${STRIP_H}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
            <path d={stripLine} fill="none" stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {signals.map((i, j) => {
              const u = easeOutBack(ph(markerBase + j * 0.025, 0.3))
              if (u <= 0) return null
              const x = stripX(i)
              const y = STRIP_H - 4
              return (
                <path
                  key={`${mode}-${i}`}
                  d={`M${x} ${y - 7 * u}L${x + 4} ${y}L${x - 4} ${y}Z`}
                  fill="var(--up)"
                  opacity={clamp(u)}
                />
              )
            })}
          </svg>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={replay}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5" />
          {t("Repetir animación", "Replay animation")}
        </button>
      </div>
    </div>
  )
}

function pathOf([p0, p1, p2, p3]: [Point, Point, Point, Point]) {
  const r = (v: number) => Math.round(v * 10) / 10
  return `M${r(p0.x)} ${r(p0.y)}C${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)} ${r(p3.x)} ${r(p3.y)}`
}

function SignalDot({ at, color }: { at: Point; color: string }) {
  return (
    <g>
      <circle cx={at.x} cy={at.y} r={9} fill={color} opacity={0.2} />
      <circle cx={at.x} cy={at.y} r={4} fill={color} />
    </g>
  )
}

const portBase = "absolute size-3.5 rounded-full border-2 border-border-strong bg-card"

function FlowNode({
  rect,
  dir,
  kind,
  Icon,
  text,
  style,
  ports,
  compact,
  lifted,
  glow = 0,
}: {
  rect: Rect
  dir: Layout["dir"]
  kind: keyof typeof nodeStyles
  Icon: LucideIcon
  text: { kicker: string; title: string; subtitle: string }
  style?: React.CSSProperties
  ports: { in?: boolean; out?: boolean }
  compact?: boolean
  lifted?: boolean
  glow?: number
}) {
  return (
    <div
      className={cn(
        "absolute flex items-center gap-3 overflow-visible rounded-2xl border bg-card bg-gradient-to-b px-3",
        nodeStyles[kind].box,
        lifted ? "shadow-xl" : "shadow-sm"
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        boxShadow: glow > 0 ? `0 0 0 ${3 * glow}px color-mix(in oklch, var(--up) ${Math.round(30 * glow)}%, transparent), 0 8px 24px -8px color-mix(in oklch, var(--up) ${Math.round(60 * glow)}%, transparent)` : undefined,
        ...style,
      }}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-current/15 ring-inset", nodeStyles[kind].chip)}>
        <Icon className="size-4.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {!compact && (
          <span className="truncate text-[0.625rem] leading-none font-semibold tracking-wide text-muted-foreground uppercase">
            {text.kicker}
          </span>
        )}
        <span className="truncate text-body leading-tight font-semibold">{text.title}</span>
        {!compact && <span className="line-clamp-2 text-caption leading-snug text-muted-foreground">{text.subtitle}</span>}
      </span>
      {ports.in && (
        <span
          aria-hidden
          className={cn(portBase, dir === "h" ? "top-1/2 -left-[0.45rem] -translate-y-1/2" : "-top-[0.45rem] left-1/2 -translate-x-1/2")}
        />
      )}
      {ports.out && (
        <span
          aria-hidden
          className={cn(portBase, dir === "h" ? "top-1/2 -right-[0.45rem] -translate-y-1/2" : "-bottom-[0.45rem] left-1/2 -translate-x-1/2")}
        />
      )}
    </div>
  )
}

export { BuilderArt }
