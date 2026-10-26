"use client"

import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import type { LiveFigures } from "@/lib/backtest-report"
import type { BacktestResult, BacktestTrade } from "@/lib/backtests"
import { clamp } from "@/lib/chart-geometry"
import { sign, useReplayText } from "./format"
import { SPEEDS, type Playback, type Speed } from "./use-playback"

export type TileSpec = {
  id: "equity" | "benchmark" | "drawdown" | "wins" | "position"
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: "up" | "down"
}

/**
 * The live tiles that have a twin among the report's key figures: when the replay ends they fly
 * there (see `dock.tsx`). Tile id → `Metric.id` of `report/key-metrics.tsx`.
 */
export const DOCK_TARGETS = { equity: "return", benchmark: "benchmark", drawdown: "drawdown", wins: "winrate" } as const
export type DockId = keyof typeof DOCK_TARGETS
export const dockIds = Object.keys(DOCK_TARGETS) as DockId[]

export function Tile({ label, value, sub, tone, className, id }: Omit<TileSpec, "id"> & { id?: TileSpec["id"]; className?: string }) {
  return (
    <div data-tile={id} className={cn("flex min-w-0 flex-col gap-0.5 bg-card px-3 py-2.5", className)}>
      <dt className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("num truncate text-base leading-tight font-bold tracking-tight sm:text-title", tone === "up" && "text-up", tone === "down" && "text-down")}>
        {value}
      </dd>
      {sub && <dd className="num truncate text-caption text-muted-foreground">{sub}</dd>}
    </div>
  )
}

/** The account figures at the playback position, as tile contents. */
export function useLiveTiles(figures: LiveFigures): TileSpec[] {
  const { t, f } = useReplayText()
  return [
    {
      id: "equity",
      label: t("Capital", "Equity"),
      value: f.usdt(figures.equity),
      sub: <span className={cn(sign(figures.returnPct) === "up" && "text-up", sign(figures.returnPct) === "down" && "text-down")}>{f.signedPct(figures.returnPct, 2)}</span>,
    },
    {
      id: "benchmark",
      label: t("Vs. comprar y mantener", "Vs. buy and hold"),
      value: f.pts(figures.vsBenchmark),
      tone: sign(Math.abs(figures.vsBenchmark) < 0.05 ? 0 : figures.vsBenchmark),
      sub: t(`Mercado ${f.signedPct(figures.benchmarkReturnPct)}`, `Market ${f.signedPct(figures.benchmarkReturnPct)}`),
    },
    {
      id: "drawdown",
      label: t("Caída máxima", "Max drawdown"),
      value: figures.maxDrawdownPct > 0 ? f.signedPct(-figures.maxDrawdownPct) : f.pct(0),
      tone: figures.maxDrawdownPct > 0 ? "down" : undefined,
      sub: t(`Ahora ${f.signedPct(-figures.drawdownPct)}`, `Now ${f.signedPct(-figures.drawdownPct)}`),
    },
    {
      id: "wins",
      label: t("Operaciones ganadas", "Winning trades"),
      value: figures.closed ? `${f.count.format(figures.wins)} / ${f.count.format(figures.closed)}` : "—",
      sub: t(
        `${f.plural(figures.buys, "compra", "compras")} · ${f.plural(figures.sells, "venta", "ventas")}`,
        `${f.plural(figures.buys, "buy", "buys")} · ${f.plural(figures.sells, "sell", "sells")}`
      ),
    },
    {
      id: "position",
      label: t("Posición", "Position"),
      value: figures.openTrip ? t("Abierta", "Open") : t("Sin posición", "Flat"),
      tone: figures.openTrip ? sign(figures.openChangePct) : undefined,
      sub:
        figures.openTrip && figures.openChangePct !== null
          ? t(`Precio ${f.signedPct(figures.openChangePct)} desde la compra`, `Price ${f.signedPct(figures.openChangePct)} since the buy`)
          : t("Esperando señal de compra", "Waiting for a buy signal"),
    },
  ]
}

/** Account figures at the playback position, plus a ticker with the last order. */
export function LiveKpis({
  tiles,
  lastTrade,
  result,
}: {
  tiles: TileSpec[]
  lastTrade: { trade: BacktestTrade; n: number } | null
  result: BacktestResult
}) {
  const { t, f } = useReplayText()
  const trip = lastTrade ? result.roundTrips[lastTrade.trade.roundTrip] : undefined
  const closes = lastTrade && lastTrade.trade.side === "sell" && trip && !trip.open && trip.exitTime === lastTrade.trade.time
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-1">
      {tiles.map((tile) => (
        <Tile key={tile.id} {...tile} />
      ))}
      <div className="relative flex min-h-16 flex-col justify-center overflow-hidden bg-card px-3 py-2.5 sm:col-span-1 lg:col-span-1">
        <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("Última orden", "Last order")}</dt>
        {lastTrade ? (
          <dd
            key={lastTrade.n}
            className={cn(
              "num truncate font-semibold motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
              lastTrade.trade.side === "buy" ? "text-up" : "text-down"
            )}
          >
            {lastTrade.trade.side === "buy" ? t("▲ Compra", "▲ Buy") : t("▼ Venta", "▼ Sell")} · {f.price(lastTrade.trade.price)}
            {closes && (
              <span className={cn("mt-0.5 block w-fit rounded-full px-1.5 py-0.5 text-[11px]", trip.pnl > 0 ? "bg-up-soft text-up" : "bg-down-soft text-down")}>
                {t(`Operación ${f.signedPct(trip.pnlPct)}`, `Trade ${f.signedPct(trip.pnlPct)}`)}
              </span>
            )}
          </dd>
        ) : (
          <dd className="text-caption text-muted-foreground">{t("Todavía ninguna", "None yet")}</dd>
        )}
      </div>
    </dl>
  )
}

/**
 * Play/pause, speed, a draggable timeline (with the trades as coloured spans) and "skip to the
 * summary". The timeline is a slider: arrows move it, Home/End jump.
 */
export function PlaybackBar({
  playback,
  result,
  intraday,
}: {
  playback: Playback
  result: BacktestResult
  intraday: boolean
}) {
  const { t, f } = useReplayText()
  const steps = result.candles.length
  const progress = playback.pos / steps
  const index = Math.max(0, Math.min(steps - 1, Math.ceil(playback.pos) - 1))
  const date = (intraday ? f.tradeDateTime : f.date).format(new Date(result.candles[index].time))
  const realCandle = Math.round(progress * result.candleCount)
  return (
    <TimelineBar
      playback={playback}
      steps={steps}
      date={`${date}${intraday ? " UTC" : ""}`}
      counter={`${t("Vela", "Candle")} ${f.count.format(realCandle)} / ${f.count.format(result.candleCount)} · ${Math.round(progress * 100)}${t(" %", "%")}`}
      marks={result.roundTrips.map((trip, k) => (
        <span
          key={k}
          className={cn("absolute inset-y-0", trip.open ? "bg-primary/40" : trip.pnl > 0 ? "bg-up/55" : "bg-down/55")}
          style={{
            left: `${(trip.entryIndex / steps) * 100}%`,
            width: `max(2px, ${((trip.exitIndex - trip.entryIndex + 1) / steps) * 100}%)`,
          }}
        />
      ))}
    />
  )
}

/**
 * Play/pause, speed, draggable position and "see summary", for any replay. `date` and `counter`
 * describe the position; `marks` are absolutely positioned spans drawn on the track.
 */
export function TimelineBar({
  playback,
  steps,
  date,
  counter,
  marks,
}: {
  playback: Playback
  steps: number
  date: string
  counter: string
  marks?: React.ReactNode
}) {
  const { t } = useReplayText()
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const progress = playback.pos / steps

  const seekAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect) return
    playback.seek(clamp((clientX - rect.left) / rect.width) * steps)
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    playback.pause()
    seekAt(e.clientX)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekAt(e.clientX)
  }
  const onUp = () => {
    dragging.current = false
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const jump = steps * 0.02
    if (e.key === "ArrowRight" || e.key === "ArrowUp") playback.seek(playback.pos + jump)
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") playback.seek(playback.pos - jump)
    else if (e.key === "Home") playback.seek(0)
    else if (e.key === "End") playback.seek(steps)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="default"
          onClick={playback.toggle}
          aria-label={playback.playing ? t("Pausar (espacio)", "Pause (space)") : t("Reproducir (espacio)", "Play (space)")}
        >
          {playback.playing ? <PauseIcon /> : playback.pos >= steps ? <RotateCcwIcon /> : <PlayIcon />}
        </Button>
        <SegmentedControl<`${Speed}`>
          options={SPEEDS.map((s) => `${s}` as `${Speed}`)}
          value={`${playback.speed}`}
          onValueChange={(v) => playback.setSpeed(Number(v) as Speed)}
          labels={{ "1": "1×", "2": "2×", "4": "4×" }}
          size="sm"
          label={t("Velocidad", "Speed")}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label={t("Posición de la reproducción", "Playback position")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuetext={date}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          className="group relative h-6 cursor-pointer touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
            {marks}
            <span className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${progress * 100}%` }} />
          </div>
          <span
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-md transition-transform group-active:scale-110"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <p className="num flex justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="truncate">{date}</span>
          <span className="shrink-0">{counter}</span>
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={playback.skip} className="self-end sm:self-auto">
        <SkipForwardIcon data-icon="inline-start" />
        {t("Ver resumen", "See summary")}
      </Button>
    </div>
  )
}
