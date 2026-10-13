"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2Icon, LoaderCircleIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react"
import { cn } from "cn"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { estimateCandles, type Timeframe } from "@/lib/candles"
import { formatDate, formatPrice } from "@/lib/format"
import { buildReplay, REPLAY_MAX_STEPS, replayDuration, type Replay } from "@/lib/replay-mock"

export type ReplayRun = {
  symbol: string
  strategy: string
  timeframe: Timeframe
  /** Inclusive range, YYYY-MM-DD. */
  from: string
  to: string
  /** "new": just executed; "review": opened from the history. */
  mode: "new" | "review"
}

const DAY_MS = 86_400_000
const count = new Intl.NumberFormat("es-ES", { useGrouping: "always" })
const amount = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signedAmount = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
})

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Large pop-up that replays a backtest candle by candle and ends with the strategy stats. */
function BacktestReplayDialog({
  open,
  onOpenChange,
  run,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  run: ReplayRun
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ReplayPlayer run={run} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ReplayPlayer({ run, onClose }: { run: ReplayRun; onClose: () => void }) {
  const candleCount = Math.max(estimateCandles(run.from, run.to, run.timeframe), 60)
  const steps = Math.min(candleCount, REPLAY_MAX_STEPS)
  const seconds = Math.round(replayDuration(candleCount) / 1000)
  const replay = useMemo(
    () => buildReplay(hash(`${run.symbol}${run.strategy}${run.from}`), steps),
    [run.symbol, run.strategy, run.from, steps]
  )

  const [runKey, setRunKey] = useState(0)
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const skipRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const duration = replayDuration(candleCount)
    const appeared = new Map<number, number>()
    const start = performance.now()
    const style = getComputedStyle(document.documentElement)
    const color = (token: string) => style.getPropertyValue(token).trim()
    const colors = {
      up: color("--up"),
      down: color("--down"),
      text: color("--muted-foreground"),
      grid: color("--border"),
      cursor: color("--border-strong"),
      fg: color("--foreground"),
      bg: color("--background"),
    }
    const font = `11px ${getComputedStyle(canvas).fontFamily}`
    const prices = replay.candles.flatMap((c) => [c.high, c.low])
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const margin = (hi - lo) * 0.06
    const min = lo - margin
    const max = hi + margin

    let raf = 0
    let visible = 1
    let stopped = false

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const padL = 8
      const padR = 64
      const padY = 14
      const plotW = w - padL - padR
      const plotH = h - padY * 2
      const slot = plotW / steps
      const x = (i: number) => padL + (i + 0.5) * slot
      const y = (p: number) => padY + (1 - (p - min) / (max - min)) * plotH

      ctx.font = font
      ctx.textBaseline = "middle"
      ctx.textAlign = "left"
      ctx.lineWidth = 1
      for (let g = 0; g < 5; g++) {
        const price = max - ((max - min) * g) / 4
        ctx.strokeStyle = colors.grid
        ctx.beginPath()
        ctx.moveTo(padL, y(price))
        ctx.lineTo(w - padR, y(price))
        ctx.stroke()
        ctx.fillStyle = colors.text
        ctx.fillText(amount.format(price), w - padR + 8, y(price))
      }

      const body = Math.max(1, slot * 0.6)
      for (let i = 0; i < visible; i++) {
        const c = replay.candles[i]
        ctx.fillStyle = ctx.strokeStyle = c.close >= c.open ? colors.up : colors.down
        ctx.beginPath()
        ctx.moveTo(x(i), y(c.high))
        ctx.lineTo(x(i), y(c.low))
        ctx.stroke()
        const top = y(Math.max(c.open, c.close))
        ctx.fillRect(x(i) - body / 2, top, body, Math.max(1, y(Math.min(c.open, c.close)) - top))
      }

      // Cursor on the candle being revealed + its close on the price axis.
      const current = replay.candles[visible - 1]
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = colors.cursor
      ctx.beginPath()
      ctx.moveTo(x(visible - 1), padY)
      ctx.lineTo(x(visible - 1), h - padY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = colors.fg
      ctx.fillRect(w - padR + 2, y(current.close) - 9, padR - 4, 18)
      ctx.fillStyle = colors.bg
      ctx.fillText(amount.format(current.close), w - padR + 6, y(current.close))

      // Trade markers: pop-in + expanding ring when they appear.
      for (const trade of replay.trades) {
        if (trade.index >= visible) break
        if (!appeared.has(trade.index)) appeared.set(trade.index, now)
        const age = now - appeared.get(trade.index)!
        const buy = trade.side === "buy"
        const c = replay.candles[trade.index]
        const cx = x(trade.index)
        const cy = buy ? y(c.low) + 12 : y(c.high) - 12
        const pop = age < 280 ? 1 + 0.35 * Math.sin((age / 280) * Math.PI) : 1
        const size = 6 * Math.min(1, age / 120 + 0.2) * pop
        const tint = buy ? colors.up : colors.down
        if (age < 700) {
          ctx.globalAlpha = 1 - age / 700
          ctx.strokeStyle = tint
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(cx, cy, 6 + (age / 700) * 20, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
          ctx.lineWidth = 1
        }
        ctx.fillStyle = tint
        ctx.beginPath()
        if (buy) {
          ctx.moveTo(cx, cy - size)
          ctx.lineTo(cx + size, cy + size)
          ctx.lineTo(cx - size, cy + size)
        } else {
          ctx.moveTo(cx, cy + size)
          ctx.lineTo(cx + size, cy - size)
          ctx.lineTo(cx - size, cy - size)
        }
        ctx.closePath()
        ctx.fill()
      }
    }

    const frame = (now: number) => {
      if (stopped) return
      const skipped = skipRef.current || reduceMotion
      const p = skipped ? 1 : Math.min(1, (now - start) / duration)
      visible = Math.max(1, Math.ceil(p * steps))
      if (skipped) for (const t of replay.trades) appeared.set(t.index, -Infinity)
      setStep(visible)
      draw(now)
      if (p >= 1) setDone(true)
      // Keep painting a bit after the end so the last markers finish their pulse.
      if (!(p >= 1 && (skipped || now - start >= duration + 800))) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const observer = new ResizeObserver(() => draw(performance.now()))
    observer.observe(canvas)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [replay, steps, candleCount, runKey])

  const i = step - 1
  const progress = step / steps
  const date = formatDate(
    new Date(Date.parse(run.from) + progress * (Date.parse(run.to) + DAY_MS - Date.parse(run.from))).toISOString()
  )
  const lastTrade = [...replay.trades].reverse().find((t) => t.index <= i)

  const restart = () => {
    skipRef.current = false
    setDone(false)
    setStep(1)
    setRunKey((k) => k + 1)
  }

  return (
    <>
      <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
        <AssetAvatar symbol={run.symbol} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <DialogTitle className="truncate text-title font-bold">
            {run.symbol}/USDT · {run.strategy}
          </DialogTitle>
          <DialogDescription className="num text-caption text-muted-foreground">
            {run.timeframe} · {formatDate(run.from)} → {formatDate(run.to)} · {count.format(candleCount)} velas ·{" "}
            {run.mode === "new" ? "Backtest ejecutado ahora" : "Revisión de backtest"}
          </DialogDescription>
        </div>
        <Badge variant={done ? "up" : "primary"} className="hidden sm:inline-flex">
          {done ? <CheckCircle2Icon /> : <LoaderCircleIcon className="animate-spin" />}
          {done ? "Completado" : "Ejecutando…"}
        </Badge>
        <DialogClose />
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-5">
        <div className="flex flex-col gap-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="num flex justify-between gap-3 text-caption text-muted-foreground">
            <span>{date}</span>
            <span>
              Vela {count.format(Math.round(progress * candleCount))} / {count.format(candleCount)} ·{" "}
              {Math.round(progress * 100)}%
            </span>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Live label="Precio" value={formatPrice(replay.candles[i].close)} />
          <Live label="Compras" value={String(replay.buys[i])} tone="up" />
          <Live label="Ventas" value={String(replay.sells[i])} tone="down" />
          <Live label="PnL realizado" value={`${signedAmount.format(replay.realized[i])} USDT`} tone={sign(replay.realized[i])} />
          <Live label="Capital" value={`${amount.format(replay.equity[i])} USDT`} />
        </dl>

        <div className="relative h-72 overflow-hidden rounded-lg border bg-background md:h-96">
          <canvas ref={canvasRef} role="img" aria-label="Animación de velas y operaciones de la estrategia" className="size-full" />
          <div className="pointer-events-none absolute top-2 left-3 flex flex-wrap items-center gap-2 text-caption">
            <span className="inline-flex items-center gap-1 text-up">▲ Compra</span>
            <span className="inline-flex items-center gap-1 text-down">▼ Venta</span>
            {lastTrade && (
              <Badge
                key={lastTrade.index}
                variant={lastTrade.side === "buy" ? "up" : "down"}
                className="num motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:slide-in-from-left-2"
              >
                {lastTrade.side === "buy" ? "Compra" : "Venta"} a {formatPrice(lastTrade.price)}
              </Badge>
            )}
          </div>
        </div>

        {done && <Results replay={replay} candleCount={candleCount} />}
      </div>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <p className="text-caption text-muted-foreground">
          {done
            ? "Datos de ejemplo: los resultados reales llegarán con el motor de backtesting."
            : `La animación dura ≈ ${seconds} s según las velas analizadas.`}
        </p>
        <div className="flex gap-2 self-end">
          {done ? (
            <>
              <Button variant="outline" onClick={restart}>
                <RotateCcwIcon data-icon="inline-start" />
                Repetir animación
              </Button>
              <Button onClick={onClose}>Cerrar</Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                skipRef.current = true
              }}
            >
              <SkipForwardIcon data-icon="inline-start" />
              Omitir animación
            </Button>
          )}
        </div>
      </footer>
    </>
  )
}

const sign = (value: number) => (value > 0 ? "up" : value < 0 ? "down" : undefined)

function Live({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn("num truncate font-bold", tone === "up" && "text-up", tone === "down" && "text-down")}>{value}</dd>
    </div>
  )
}

/** Final statistics, revealed tile by tile when the animation ends. */
function Results({ replay, candleCount }: { replay: Replay; candleCount: number }) {
  const s = replay.stats
  const tiles: { label: string; value: string; tone?: "up" | "down"; hint?: string }[] = [
    { label: "Compras", value: String(s.buys) },
    { label: "Ventas", value: String(s.sells) },
    { label: "PnL realizado", value: `${signedAmount.format(s.realizedPnl)} USDT`, tone: sign(s.realizedPnl) },
    {
      label: "PnL no realizado",
      value: `${signedAmount.format(s.unrealizedPnl)} USDT`,
      tone: sign(s.unrealizedPnl),
      hint: s.openPosition ? "Posición abierta" : "Sin posición abierta",
    },
    { label: "Rentabilidad total", value: `${signedAmount.format(s.returnPct)} %`, tone: sign(s.returnPct) },
    { label: "Capital final", value: `${amount.format(s.finalCapital)} USDT` },
    { label: "Tasa de acierto", value: `${amount.format(s.winRatePct)} %` },
    { label: "Drawdown máx.", value: `−${amount.format(s.maxDrawdownPct)} %`, tone: s.maxDrawdownPct > 0 ? "down" : undefined },
  ]
  return (
    <section
      aria-label="Estadísticas del backtest"
      className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-title font-bold">Resultados</h3>
        <span className="num text-caption text-muted-foreground">{count.format(candleCount)} velas analizadas</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile, index) => (
          <div
            key={tile.label}
            style={{ animationDelay: `${index * 70}ms` }}
            className="rounded-lg border bg-card px-3 py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:fill-mode-both motion-safe:duration-500"
          >
            <dt className="text-caption text-muted-foreground">{tile.label}</dt>
            <dd
              className={cn(
                "num text-title font-bold",
                tile.tone === "up" && "text-up",
                tile.tone === "down" && "text-down"
              )}
            >
              {tile.value}
            </dd>
            {tile.hint && <p className="text-caption text-muted-foreground">{tile.hint}</p>}
          </div>
        ))}
      </dl>
    </section>
  )
}

export { BacktestReplayDialog, ReplayPlayer }
