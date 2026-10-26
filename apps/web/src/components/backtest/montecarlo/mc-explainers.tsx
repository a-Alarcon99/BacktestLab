"use client"

import { useI18n } from "@/components/i18n/locale-provider"
import { clamp, easeInOutCubic, easeOutBack, lerp, linePath, phase } from "@/lib/chart-geometry"
import type { McMethod } from "@/lib/monte-carlo"
import { CYCLE, Steps, useLoop } from "../robust/explainers"
import { glow, useSvgId, VizDefs } from "../robust/viz"

// "How does it work?" of each kind of Monte Carlo: a looping drawing and three short steps, shown
// at the top of the form. Time-driven only while on screen, and still (final frame) with reduced motion.

const W = 600
const H = 160

/** What a trade did, in arbitrary units (the same seven are used by both drawings of the trades). */
const TRADES = [3, -2, 4, -1, 5, -3, 2]
const PERMS = [
  [0, 1, 2, 3, 4, 5, 6],
  [3, 0, 5, 2, 6, 1, 4],
  [6, 4, 1, 0, 3, 2, 5],
  [2, 5, 0, 6, 1, 4, 3],
]
/** Trades drawn again at random: some come out twice, some not at all. */
const DRAWN = [2, 2, 5, 0, 4, 2, 6]

const GOOD = "var(--up)"
const BAD = "var(--down)"

/** Bars of the trades in `order`, gliding from `from` to `to`, and the equity they build. */
function TradesDrawing({ method }: { method: McMethod }) {
  const { t } = useI18n()
  const id = useSvgId()
  const { ref, s } = useLoop()
  const slotW = 46
  const x0 = (W - TRADES.length * slotW) / 2
  const stages = PERMS.length
  const dur = (CYCLE - 0.4) / stages
  const stage = Math.min(stages - 1, Math.floor(Math.max(0, s - 0.2) / dur))
  const local = Math.max(0, s - 0.2 - stage * dur)
  const glide = easeInOutCubic(phase(local, 0, dur * 0.55))
  const build = phase(local, dur * 0.45, dur * 0.5)
  const prevOrder = PERMS[Math.max(0, stage - 1)]
  const order = method === "shuffle" ? PERMS[stage] : DRAWN.map((v, k) => (stage % 2 === 0 ? v : DRAWN[(k + 3) % DRAWN.length]))
  const orderBefore = method === "shuffle" ? prevOrder : DRAWN
  const slotOf = (perm: number[], trade: number) => Math.max(0, perm.indexOf(trade))
  const base = 60
  const unit = 6.2

  // Equity of an order, drawn up to `upTo` (0-1) of its length, from the left of the lower chart.
  const curve = (perm: number[], upTo: number) => {
    const pts = [{ x: x0 + 8, y: 138 }]
    let acc = 0
    perm.forEach((trade, k) => {
      acc += TRADES[trade]
      pts.push({ x: x0 + (k + 1) * slotW - slotW / 2 + 8, y: 138 - acc * 3.6 })
    })
    const at = clamp(upTo) * (pts.length - 1)
    const whole = Math.floor(at)
    const out = pts.slice(0, whole + 1)
    if (whole + 1 < pts.length && at > whole) out.push({ x: lerp(pts[whole].x, pts[whole + 1].x, at - whole), y: lerp(pts[whole].y, pts[whole + 1].y, at - whole) })
    return out
  }
  const ghosts = Array.from({ length: stage }, (_, k) => (method === "shuffle" ? PERMS[k] : DRAWN.map((v, j) => (k % 2 === 0 ? v : DRAWN[(j + 3) % DRAWN.length]))))
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={method === "shuffle" ? t("Dibujo de operaciones que cambian de orden", "Drawing of trades changing order") : t("Dibujo de operaciones sacadas al azar", "Drawing of trades drawn at random")}>
        <VizDefs id={id} />
        <line x1={x0} x2={x0 + TRADES.length * slotW} y1={base} y2={base} stroke="var(--border-strong)" />
        {order.map((trade, k) => {
          const from = method === "shuffle" ? slotOf(orderBefore, trade) : k
          const to = method === "shuffle" ? slotOf(order, trade) : k
          const pop = method === "shuffle" ? 1 : easeOutBack(phase(local, 0.1 + k * 0.1, 0.35))
          const x = x0 + lerp(from, to, glide) * slotW + 8
          const v = TRADES[trade]
          const h = Math.abs(v) * unit * pop
          return (
            <g key={method === "shuffle" ? trade : k}>
              <rect x={x} y={v >= 0 ? base - h : base} width={slotW - 16} height={Math.max(0.1, h)} rx={5} fill={v >= 0 ? GOOD : BAD} opacity={0.9} />
              <text x={x + (slotW - 16) / 2} y={v >= 0 ? base - h - 5 : base + h + 12} textAnchor="middle" fontSize={10} fontWeight={700} fill={v >= 0 ? GOOD : BAD} className="num" opacity={pop}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          )
        })}
        <text x={x0} y={16} fontSize={11} fontWeight={700} fill="var(--muted-foreground)">
          {method === "shuffle" ? t("Tus operaciones, cada vez en otro orden", "Your trades, each time in another order") : t("Operaciones sacadas al azar (algunas se repiten)", "Trades drawn at random (some repeat)")}
        </text>
        <line x1={x0} x2={x0 + TRADES.length * slotW} y1={138} y2={138} stroke="var(--border)" strokeDasharray="3 4" />
        {ghosts.map((perm, k) => (
          <path key={k} d={linePath(curve(perm, 1))} fill="none" stroke="var(--primary)" strokeWidth={1.4} opacity={0.3} />
        ))}
        <path d={linePath(curve(order, build))} fill="none" stroke="var(--primary)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" filter={glow(id)} />
        <text x={x0 + TRADES.length * slotW + 12} y={146} fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
          {method === "shuffle" ? t("mismo final, distinto camino", "same end, different path") : t("cada intento acaba en un sitio", "each try ends somewhere")}
        </text>
      </svg>
    </div>
  )
}

/** One shared wavy price, in the range 0..1 → y. */
const wave = (u: number) => 0.5 + 0.28 * Math.sin(u * 9) + 0.12 * Math.sin(u * 23 + 1) + (u - 0.5) * 0.25

/** The price cut into pieces that are glued again in another order, many times. */
function PathsDrawing() {
  const { t } = useI18n()
  const id = useSvgId()
  const { ref, s } = useLoop()
  const blocks = 4
  const X0 = 24
  const X1 = W - 24
  const width = (X1 - X0) / blocks
  const colours = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4, var(--primary))"]
  const orders = [[2, 0, 3, 1], [1, 3, 3, 0], [3, 1, 0, 2], [0, 2, 2, 3]]
  const top = { y0: 16, h: 52 }
  const bottom = { y0: 92, h: 52 }
  const cut = easeInOutCubic(phase(s, 0.4, 1))
  const move = easeInOutCubic(phase(s, 1.6, 1.6))
  const fan = phase(s, 3.8, 2.4)
  // Vertical shift that makes a block start where the previous one ended in a new order.
  const newLine = (order: number[], y0: number, h: number) => {
    const out: { b: number; slot: number; shift: number }[] = []
    let endY = y0 + (1 - wave(order[0] / blocks)) * h
    order.forEach((b, slot) => {
      const startY = y0 + (1 - wave(b / blocks)) * h
      const shift = slot === 0 ? 0 : endY - startY
      out.push({ b, slot, shift })
      endY = y0 + (1 - wave((b + 1) / blocks)) * h + shift
    })
    return out
  }
  const main = newLine(orders[0], bottom.y0, bottom.h)
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("Dibujo del precio cortado en trozos que se pegan en otro orden", "Drawing of the price cut into pieces glued in another order")}>
        <VizDefs id={id} />
        <text x={X0} y={10} fontSize={11} fontWeight={700} fill="var(--muted-foreground)">
          {t("Precio real, cortado en trozos", "Real price, cut into pieces")}
        </text>
        {Array.from({ length: blocks }, (_, b) => {
          const gap = cut * 6
          const pts = Array.from({ length: 18 }, (_, k) => ({ x: X0 + b * width + gap * b - gap * 1.5 + (k / 17) * (width - 2), y: top.y0 + (1 - wave((b + k / 17) / blocks)) * top.h }))
          return <path key={b} d={linePath(pts)} fill="none" stroke={colours[b]} strokeWidth={2.6} strokeLinecap="round" opacity={0.95} />
        })}
        <text x={X0} y={bottom.y0 - 10} fontSize={11} fontWeight={700} fill="var(--muted-foreground)">
          {t("Mercados nuevos con los mismos trozos", "New markets made of the same pieces")}
        </text>
        {/* The first new market: the pieces glide down into their new places. */}
        {main.map(({ b, slot, shift }) => {
          const pts = Array.from({ length: 18 }, (_, k) => {
            const homeX = X0 + b * width + (k / 17) * (width - 2)
            const newX = X0 + slot * width + (k / 17) * (width - 2)
            const homeY = top.y0 + (1 - wave((b + k / 17) / blocks)) * top.h
            const newY = bottom.y0 + (1 - wave((b + k / 17) / blocks)) * bottom.h + shift
            return { x: lerp(homeX, newX, move), y: lerp(homeY, newY, move) }
          })
          return move > 0 ? <path key={`n${slot}`} d={linePath(pts)} fill="none" stroke={colours[b]} strokeWidth={2.8} strokeLinecap="round" filter={glow(id)} /> : null
        })}
        {/* Then many more, faint */}
        {fan > 0 &&
          orders.slice(1).map((order, k) => {
            const line = newLine(order, bottom.y0, bottom.h)
            const pts = line.flatMap(({ b, slot, shift }) => Array.from({ length: 12 }, (_, j) => ({ x: X0 + slot * width + (j / 11) * width, y: bottom.y0 + (1 - wave((b + j / 11) / blocks)) * bottom.h + shift })))
            const shown = pts.slice(0, Math.max(2, Math.round(clamp(fan * 3 - k * 0.6) * pts.length)))
            return <path key={k} d={linePath(shown)} fill="none" stroke="var(--primary)" strokeWidth={1.4} opacity={0.4} strokeLinejoin="round" />
          })}
        <text x={X1} y={H - 6} fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
          {t("y tu estrategia se prueba en cada uno", "and your strategy is tested on each one")}
        </text>
      </svg>
    </div>
  )
}

export type McMode = "mc-trades" | "mc-paths"

/** "How it works" of the chosen kind of Monte Carlo. */
export function McExplainer({ mode, method }: { mode: McMode; method: McMethod }) {
  const { t } = useI18n()
  const steps =
    mode === "mc-paths"
      ? [
          { title: t("Cortamos el precio real", "We cut the real price"), text: t("Dividimos la historia del precio de tu rango en trocitos de unas pocas velas seguidas, para conservar cómo se mueve el mercado.", "We split the price history of your range into little pieces of a few consecutive candles, to keep how the market moves.") },
          { title: t("Los pegamos al azar", "We glue them at random"), text: t("Con los trozos fabricamos cientos de historias de precio nuevas: parecidas a la real, pero distintas.", "With the pieces we build hundreds of new price histories: similar to the real one, but different.") },
          { title: t("Probamos tu estrategia en cada una", "We test your strategy on each"), text: t("Si gana en la mayoría, no dependía de que el mercado hiciera justo lo que hizo. Si solo gana en la real, el resultado probablemente se debió al azar.", "If it wins in most of them, it didn't depend on the market doing exactly what it did. If it only wins in the real one, the result was probably down to chance.") },
        ]
      : method === "shuffle"
        ? [
            { title: t("Tomamos tus operaciones", "We take your trades"), text: t("Ejecutamos tu estrategia una vez y guardamos lo que dio cada operación cerrada: +3 %, −2 %, +4 %…", "We run your strategy once and keep what each closed trade gave: +3 %, −2 %, +4 %…") },
            { title: t("Las barajamos", "We shuffle them"), text: t("Mismas operaciones, otro orden, miles de veces. El resultado final no cambia, pero el camino sí: unas veces la mala racha llega pronto y otras tarde.", "Same trades, another order, thousands of times. The final result doesn't change but the path does: sometimes the bad streak comes early, sometimes late.") },
            { title: t("Miramos hasta dónde cae", "We see how far it falls"), text: t("Así ves la caída en el peor orden posible, no solo en el que te tocó.", "So you see the drawdown in the worst possible order, not only in the one you got.") },
          ]
        : [
            { title: t("Tomamos tus operaciones", "We take your trades"), text: t("Ejecutamos tu estrategia una vez y guardamos lo que dio cada operación cerrada: +3 %, −2 %, +4 %…", "We run your strategy once and keep what each closed trade gave: +3 %, −2 %, +4 %…") },
            { title: t("Las sacamos al azar", "We draw them at random"), text: t("Como sacar papeletas de una bolsa y devolverlas: una operación puede salir dos veces y otra ninguna. Cada intento es una historia posible con operaciones como las tuyas.", "Like drawing tickets from a bag and putting them back: one trade may come out twice and another never. Each try is a possible history with trades like yours.") },
            { title: t("Vemos todos los finales", "We see every ending"), text: t("Si la mayoría de historias gana, tu estrategia tiene ventaja. Si solo ganó la tuya, el resultado probablemente se debió al azar.", "If most histories win, your strategy has an edge. If only yours won, the result was probably down to chance.") },
          ]
  return (
    <section aria-label={t("Cómo funciona", "How it works")} data-mode={mode} className="grid gap-4 rounded-xl border bg-muted/30 p-3 sm:p-4 lg:col-span-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0 overflow-hidden rounded-lg border bg-card">{mode === "mc-paths" ? <PathsDrawing /> : <TradesDrawing method={method} />}</div>
      <div className="flex flex-col gap-3">
        <h3 className="font-bold">{t("Cómo funciona", "How it works")}</h3>
        <Steps steps={steps} />
      </div>
    </section>
  )
}
