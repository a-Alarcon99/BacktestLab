"use client"

import { cn } from "cn"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { smoothRanks } from "@/lib/batch-report"
import { areaPath, clamp, easeOutBack, easeOutCubic, linePath, phase } from "@/lib/chart-geometry"
import { useReplayText } from "../replay/format"
import { ChartTip, TipRow, TipTitle, useChartHover } from "../robust/hover"
import { Pulse, Ring, signVar, StatTile, trianglePath, useSvgId, VizDefs, glow, paint } from "../robust/viz"
import { drawdownAt, inMarketAt, ordersUpTo, returnsAt, STEPS, timeAt, visibleCount, type TileData, type Timeline } from "./multi-data"

// The pieces of the multi-asset animation: one tile per asset (equity against buy and hold, drawn
// up to the playback position, with its orders and live figures), the ranking whose bars reorder
// as the lead changes, and a live summary of the whole group. All are pure functions of `pos`.

const VIEW_W = 240
const VIEW_H = 74
const yOf = (tile: TileData, v: number) => VIEW_H - 4 - ((v - tile.lo) / (tile.hi - tile.lo || 1)) * (VIEW_H - 10)

function MiniStat({ label, value, colour, title }: { label: string; value: string; colour?: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 px-2 py-1" title={title}>
      <p className="truncate text-[10px] leading-tight text-muted-foreground">{label}</p>
      <p className="num truncate text-caption leading-tight font-bold" style={colour ? { color: colour } : undefined}>
        {value}
      </p>
    </div>
  )
}

/** One asset: its equity curve drawing itself over the shared timeline, with its orders and live figures. */
export function AssetTile({
  tile,
  timeline,
  capital,
  pos,
  finished,
  place,
  onOpen,
}: {
  tile: TileData
  timeline: Timeline
  capital: number
  pos: number
  finished: boolean
  /** 1-based place by final return, shown once the replay ends. */
  place: number | null
  onOpen: (symbol: string) => void
}) {
  const { t, f } = useReplayText()
  const id = useSvgId()
  const u = Math.min(pos, STEPS) / STEPS
  const now = returnsAt(tile, timeline, capital, pos)
  const n = visibleCount(tile.fx, u)
  const up = (now.strategy ?? 0) >= 0
  const colour = signVar(now.strategy)
  const X = (fx: number) => fx * VIEW_W
  const points = (values: number[]) => values.slice(0, n).map((v, i) => ({ x: X(tile.fx[i]), y: yOf(tile, v) }))
  const eqPoints = points(tile.eq)
  const head = eqPoints.at(-1)
  const clickable = finished && tile.result !== null
  const lateFrom = tile.startFrac > 0.01 && tile.startsAt ? f.month.format(new Date(tile.startsAt)) : null
  const r = tile.result
  const dd = drawdownAt(tile, timeline, pos)
  const orders = ordersUpTo(tile, u)
  const inMarket = r ? inMarketAt(tile, u) : false
  const equityNow = now.strategy === null ? null : capital * (1 + now.strategy / 100)
  const yAtFx = (fx: number) => {
    const k = Math.max(0, visibleCount(tile.fx, fx) - 1)
    return yOf(tile, tile.eq[k] ?? capital)
  }
  const trail = eqPoints.slice(Math.max(0, eqPoints.length - 12))
  const beat = 0.5 + 0.5 * Math.sin(pos / 2.6)
  const hover = useChartHover(VIEW_W, VIEW_H)
  // Once finished, the pointer reads the curve under it.
  const hk = finished && hover.at && tile.fx.length ? Math.max(0, visibleCount(tile.fx, hover.at.x / VIEW_W) - 1) : null
  const reading = hk === null ? null : { x: X(tile.fx[hk]), eq: tile.eq[hk], hold: tile.bm[hk], ms: timeline.fromMs + tile.fx[hk] * (timeline.toMs - timeline.fromMs) }

  const body = (
    <>
      <div className="flex items-center gap-2">
        <AssetAvatar symbol={tile.symbol} size={24} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="flex items-center gap-1.5 font-bold">
            {tile.symbol}
            {place !== null && (
              <span className="num rounded bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground" title={t("Puesto por rentabilidad", "Place by return")}>
                #{place}
              </span>
            )}
          </span>
          {r && (
            <span className={cn("flex items-center gap-1 text-[10px] font-medium", inMarket ? "text-primary" : "text-muted-foreground")}>
              <span className={cn("size-1.5 rounded-full", inMarket ? "bg-primary" : "bg-muted-foreground/50")} />
              {finished ? t("Terminó", "Finished") + (r.stats.openPosition ? ` · ${t("posición abierta", "open position")}` : "") : inMarket ? t("Con posición", "In a position") : t("Fuera del mercado", "Out of the market")}
            </span>
          )}
        </div>
        <span className="ml-auto flex flex-col items-end leading-tight">
          <span className="num text-title font-bold" style={{ color: colour }}>
            {now.strategy === null ? "—" : f.signedPct(now.strategy)}
          </span>
          <span className="num text-[10px] text-muted-foreground">{equityNow === null ? " " : f.usdt(equityNow)}</span>
        </span>
      </div>

      {r ? (
        <div className="relative">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full overflow-visible" aria-hidden {...(finished ? hover.bind : {})}>
            <VizDefs id={id} />
            <defs>
              <linearGradient id={`${id}-scan`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="var(--primary)" stopOpacity={0} />
                <stop offset="1" stopColor="var(--primary)" stopOpacity={0.16} />
              </linearGradient>
            </defs>
            {tile.startFrac > 0.01 && <rect x={0} y={0} width={X(tile.startFrac)} height={VIEW_H} fill="var(--muted)" opacity={0.7} />}
            {tile.held.map(([from, to], k) => {
              const end = Math.min(to, u)
              return end > from ? <rect key={k} x={X(from)} y={0} width={X(end - from)} height={VIEW_H} fill="var(--primary)" opacity={0.07} /> : null
            })}
            <line x1={0} x2={VIEW_W} y1={yOf(tile, capital)} y2={yOf(tile, capital)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="2 3" />
            {eqPoints.length > 1 && <path d={areaPath(eqPoints, yOf(tile, capital))} fill={paint(id, up ? "up" : "down")} />}
            <path d={linePath(points(tile.bm))} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            {/* Sweep behind the head while it plays */}
            {!finished && head && head.x > 2 && <rect x={Math.max(0, head.x - 34)} y={0} width={Math.min(34, head.x)} height={VIEW_H} fill={`url(#${id}-scan)`} />}
            <path d={linePath(eqPoints)} fill="none" stroke={colour} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            {/* Glowing trail of the last stretch */}
            {!finished && trail.length > 1 && <path d={linePath(trail)} fill="none" stroke={colour} strokeWidth={3.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.35} filter={glow(id)} />}
            {tile.orders.map((order, k) => {
              if (order.fx > u) return null
              const age = (u - order.fx) * STEPS
              const s = easeOutBack(clamp(age / 7)) * 2.3
              const y = yAtFx(order.fx) + (order.side === "buy" ? 5.5 : -5.5)
              return (
                <g key={k}>
                  <path d={trianglePath(X(order.fx), y, s, order.side === "buy")} fill={order.side === "buy" ? "var(--up)" : "var(--down)"} opacity={0.85} />
                  {!finished && <Pulse x={X(order.fx)} y={yAtFx(order.fx)} age={age} span={12} colour={order.side === "buy" ? "var(--up)" : "var(--down)"} from={2} to={11} />}
                </g>
              )
            })}
            {/* The result of each closed trade floats up from where it closed */}
            {!finished &&
              tile.exits.map((exit, k) => {
                const age = (u - exit.fx) * STEPS
                if (age < 0 || age > 26) return null
                const lift = easeOutCubic(age / 26) * 12
                const x = clamp(X(exit.fx), 16, VIEW_W - 16)
                return (
                  <text key={k} x={x} y={yAtFx(exit.fx) - 9 - lift} textAnchor="middle" fontSize={8.5} fontWeight={800} className="num" fill={signVar(exit.pnlPct)} stroke="var(--card)" strokeWidth={3} paintOrder="stroke" opacity={1 - phase(age, 14, 12)}>
                    {f.signedPct(exit.pnlPct, 1)}
                  </text>
                )
              })}
            {head && !finished && <circle cx={head.x} cy={head.y} r={3.4 + 3 * beat} fill={colour} opacity={0.22 * (1 - beat) + 0.08} />}
            {head && <circle cx={head.x} cy={head.y} r={finished ? 3 : 3.4} fill={colour} stroke="var(--card)" strokeWidth={1.6} filter={finished ? undefined : glow(id)} />}
            {reading && (
              <>
                <line x1={reading.x} x2={reading.x} y1={0} y2={VIEW_H} stroke="var(--foreground)" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.5} />
                <circle cx={reading.x} cy={yOf(tile, reading.hold)} r={2.4} fill="var(--muted-foreground)" stroke="var(--card)" strokeWidth={1.2} />
                <circle cx={reading.x} cy={yOf(tile, reading.eq)} r={3} fill={signVar(reading.eq - capital)} stroke="var(--card)" strokeWidth={1.4} />
              </>
            )}
          </svg>
          {reading && (
            <ChartTip x={reading.x} y={yOf(tile, reading.eq)} width={VIEW_W} height={VIEW_H} className="min-w-44">
              <TipTitle>{f.date.format(new Date(reading.ms))}</TipTitle>
              <TipRow label={t("Estrategia", "Strategy")} value={f.signedPct(((reading.eq - capital) / capital) * 100)} valueColour={signVar(reading.eq - capital)} strong />
              <TipRow label={t("Mantener", "Hold")} value={f.signedPct(((reading.hold - capital) / capital) * 100)} />
            </ChartTip>
          )}
          {lateFrom && (
            <span className="absolute bottom-0 left-1 rounded bg-card/80 px-1 text-[10px] font-semibold text-muted-foreground">
              {t("Sin histórico · desde ", "No history · from ")}
              {lateFrom}
            </span>
          )}
        </div>
      ) : (
        <p className="flex h-[74px] items-center text-caption text-muted-foreground">{t("No hay velas suficientes de este activo en el rango.", "Not enough candles for this asset in the range.")}</p>
      )}

      {r && (
        <div className="grid grid-cols-4 gap-1.5">
          <MiniStat label={t("Mantener", "Hold")} value={now.hold === null ? "—" : f.signedPct(now.hold, 0)} colour={signVar(now.hold)} title={t("Comprar y mantener", "Buy and hold")} />
          <MiniStat label={t("Caída", "Drop")} value={dd === null ? "—" : `−${f.pct(dd, 0)}`} title={t("Distancia actual al máximo anterior del capital", "Current distance below the previous peak of the capital")} />
          <MiniStat label={t("Órdenes", "Orders")} value={String(orders)} />
          <MiniStat label={t("Máx. caída", "Max drop")} value={finished ? `−${f.pct(r.stats.maxDrawdownPct, 0)}` : "·"} title={t("La mayor caída del capital desde un máximo en todo el rango", "The largest fall of the capital from a peak over the whole range")} />
          {finished && (
            <>
              <MiniStat label="Sharpe" value={f.ratio.format(r.stats.sharpe)} />
              <MiniStat label={t("Acierto", "Win rate")} value={r.stats.roundTrips ? f.pct(r.stats.winRatePct, 0) : "—"} />
              <MiniStat label={t("Fact. benef.", "Profit f.")} value={r.metrics.profitFactor === null ? "—" : f.ratio.format(r.metrics.profitFactor)} />
              <MiniStat label={t("En mercado", "In market")} value={f.pct(r.metrics.exposurePct, 0)} />
            </>
          )}
        </div>
      )}
    </>
  )

  const classes = "flex min-w-0 flex-col gap-2.5 rounded-xl border bg-card p-3 text-left"
  return clickable ? (
    <button
      type="button"
      onClick={() => onOpen(tile.symbol)}
      aria-haspopup="dialog"
      aria-label={t(`Abrir el informe de ${tile.symbol}`, `Open the ${tile.symbol} report`)}
      className={cn(classes, "outline-none transition-[border-color,background-color,box-shadow] hover:border-primary/50 hover:bg-muted/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/30")}
    >
      {body}
    </button>
  ) : (
    <div className={cn(classes, !tile.result && "opacity-70")}>{body}</div>
  )
}

const ROW_H = 36

/** Bars of the current return per asset, best on top; they glide to their place as the lead changes. */
export function RankingPanel({
  tiles,
  timeline,
  capital,
  pos,
  domain,
}: {
  tiles: TileData[]
  timeline: Timeline
  capital: number
  pos: number
  domain: [number, number]
}) {
  const { t, f } = useReplayText()
  const [lo, hi] = domain
  const span = hi - lo
  const zero = (-lo / span) * 100
  const valuesAt = (p: number) => tiles.map((tile) => returnsAt(tile, timeline, capital, p).strategy)
  const ranks = smoothRanks(valuesAt, pos, 8)
  const date = f.date.format(new Date(timeAt(timeline, pos)))

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-bold">{t("Ranking en vivo", "Live ranking")}</h3>
        <span className="num text-[11px] text-muted-foreground">{date}</span>
      </div>
      <ol aria-label={t("Rentabilidad actual por activo", "Current return by asset")} className="relative" style={{ height: tiles.length * ROW_H }}>
        {tiles.map((tile, i) => {
          const now = returnsAt(tile, timeline, capital, pos)
          const v = now.strategy
          const pct = (x: number) => `${(Math.abs(x) / span) * 100}%`
          return (
            <li
              key={tile.symbol}
              className="absolute inset-x-0 top-0 flex items-center gap-2"
              style={{ height: ROW_H, transform: `translateY(${ranks[i] * ROW_H}px)` }}
            >
              <AssetAvatar symbol={tile.symbol} size={24} />
              <span className="w-12 shrink-0 truncate text-caption font-semibold">{tile.symbol}</span>
              <div className="relative h-3 min-w-0 flex-1 rounded-sm bg-muted/60">
                {v !== null && (
                  <span
                    className={cn("absolute inset-y-0 rounded-sm", v >= 0 ? "bg-up" : "bg-down")}
                    style={{ left: v >= 0 ? `${zero}%` : `${zero - (Math.abs(v) / span) * 100}%`, width: pct(v) }}
                  />
                )}
                <span aria-hidden className="absolute inset-y-[-2px] w-px bg-border-strong" style={{ left: `${zero}%` }} />
                {now.hold !== null && (
                  <span
                    aria-hidden
                    title={t("Comprar y mantener", "Buy and hold")}
                    className="absolute inset-y-[-3px] w-0.5 rounded bg-foreground/60"
                    style={{ left: `${zero + (now.hold / span) * 100}%` }}
                  />
                )}
              </div>
              <span className={cn("num w-16 shrink-0 text-right text-caption font-semibold", v === null ? "text-muted-foreground" : v >= 0 ? "text-up" : "text-down")}>
                {v === null ? (tile.result ? t("sin datos", "no data") : "—") : f.signedPct(v)}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-up" /> {t("Estrategia", "Strategy")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-0.5 rounded bg-foreground/60" /> {t("Comprar y mantener", "Buy and hold")}
        </span>
      </p>
    </div>
  )
}

const AVG_W = 260
const AVG_H = 84
const AVG_POINTS = 48

/** The group as a whole at `pos`: how many are in profit, the average return and its path so far. */
export function LiveSummary({ tiles, timeline, capital, pos }: { tiles: TileData[]; timeline: Timeline; capital: number; pos: number }) {
  const { t, f } = useReplayText()
  const id = useSvgId()
  const u = Math.min(pos, STEPS) / STEPS
  const average = (p: number, key: "strategy" | "hold") => {
    const values = tiles.flatMap((tile) => {
      const v = returnsAt(tile, timeline, capital, p)[key]
      return v === null ? [] : [v]
    })
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
  }
  const nowReturns = tiles.flatMap((tile) => {
    const v = returnsAt(tile, timeline, capital, pos).strategy
    return v === null ? [] : [v]
  })
  const profit = nowReturns.filter((v) => v > 0).length
  const meanNow = average(pos, "strategy")
  const holdNow = average(pos, "hold")
  const drops = tiles.flatMap((tile) => {
    const d = drawdownAt(tile, timeline, pos)
    return d === null ? [] : [d]
  })
  const meanDrop = drops.length ? drops.reduce((sum, v) => sum + v, 0) / drops.length : null
  const orders = tiles.reduce((sum, tile) => sum + ordersUpTo(tile, u), 0)
  const inMarket = tiles.filter((tile) => tile.result && inMarketAt(tile, u)).length
  const steps = Math.max(2, Math.round(AVG_POINTS * u))
  const path = Array.from({ length: steps }, (_, k) => {
    const p = (k / (steps - 1)) * pos
    return { p, strategy: average(p, "strategy") ?? 0, hold: average(p, "hold") ?? 0 }
  })
  const all = [0, ...path.flatMap((q) => [q.strategy, q.hold])]
  const lo = Math.min(...all)
  const hi = Math.max(...all, lo + 1)
  const y = (v: number) => AVG_H - 6 - ((v - lo) / (hi - lo)) * (AVG_H - 12)
  const x = (p: number) => 4 + (p / STEPS) * (AVG_W - 8)
  const strategyPts = path.map((q) => ({ x: x(q.p), y: y(q.strategy) }))
  const tone = nowReturns.length === 0 ? "mixed" : profit / nowReturns.length >= 0.7 ? "good" : profit / nowReturns.length >= 0.5 ? "mixed" : "bad"

  return (
    <div className="flex flex-col gap-3 border-t p-3">
      <h3 className="font-bold">{t("El conjunto, ahora", "The group, right now")}</h3>
      <div className="flex items-center gap-3">
        <Ring value={nowReturns.length ? profit / nowReturns.length : 0} tone={tone} label={t("Activos en positivo", "Assets in profit")}>
          <span className="text-title">{nowReturns.length ? `${profit}/${nowReturns.length}` : "—"}</span>
          <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">{t("en positivo", "in profit")}</span>
        </Ring>
        <p className="num text-caption text-muted-foreground">
          {t(`${inMarket} de ${tiles.filter((x) => x.result).length} con posición abierta ahora.`, `${inMarket} of ${tiles.filter((x) => x.result).length} hold a position right now.`)}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t("Media de los activos", "Average of the assets")}</p>
        <svg viewBox={`0 0 ${AVG_W} ${AVG_H}`} className="w-full" aria-hidden>
          <VizDefs id={id} />
          <line x1={0} x2={AVG_W} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeDasharray="2 3" />
          {path.length > 1 && <path d={areaPath(strategyPts, y(0))} fill={paint(id, "primary")} />}
          {path.length > 1 && <path d={linePath(path.map((q) => ({ x: x(q.p), y: y(q.hold) })))} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} strokeDasharray="3 3" />}
          {path.length > 1 && <path d={linePath(strategyPts)} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" filter={glow(id)} />}
          {strategyPts.length > 0 && <circle cx={strategyPts.at(-1)!.x} cy={strategyPts.at(-1)!.y} r={3.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={1.8} />}
        </svg>
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <StatTile label={t("Rentab. media", "Average return")} value={meanNow === null ? "—" : f.signedPct(meanNow)} tone={meanNow === null ? undefined : meanNow > 0 ? "good" : "bad"} />
        <StatTile label={t("Mantener (media)", "Hold (average)")} value={holdNow === null ? "—" : f.signedPct(holdNow)} />
        <StatTile label={t("Caída media", "Average drop")} value={meanDrop === null ? "—" : `−${f.pct(meanDrop)}`} />
        <StatTile label={t("Órdenes", "Orders")} value={f.count.format(orders)} />
      </dl>
    </div>
  )
}
