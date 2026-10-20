"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SkipForwardIcon,
} from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  describeBacktestError,
  recordFromResult,
  runBacktest,
  type BacktestRequest,
  type BacktestResult,
} from "@/lib/backtests"
import { estimateCandles, isIntraday } from "@/lib/candles"
import { formatDate, formatPrice } from "@/lib/format"
import { intlLocale, type Locale } from "@/lib/i18n"
import { replayDuration } from "@/lib/replay"
import { LimitCta } from "@/components/plan/plan-usage"
import { addBacktest } from "@/lib/storage/backtests"
import { describeConditions, describeSize, ruleName, type Rule } from "@/lib/strategy"

export type ReplayRun = BacktestRequest & {
  /** "new": just executed (saved to the history); "review": re-run from the history. */
  mode: "new" | "review"
}

/** Number and date formats of one language (built once per language). */
function makeFormats(locale: Locale) {
  const tag = intlLocale[locale]
  return {
    count: new Intl.NumberFormat(tag, { useGrouping: "always" }),
    amount: new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    signedAmount: new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }),
    tradeDateTime: new Intl.DateTimeFormat(tag, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }),
    axisDate: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }),
    axisDateTime: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }),
  }
}

const formatsByLocale: Record<Locale, ReturnType<typeof makeFormats>> = { es: makeFormats("es"), en: makeFormats("en") }

/** Formats and translator of the page's language. */
function useReplayText() {
  const i18n = useI18n()
  return { ...i18n, f: formatsByLocale[i18n.locale] }
}

/** Narrowest slot per candle: long runs show a window of this density that follows the animation. */
const MIN_CANDLE_SLOT = 12

/** Pixels around a marker that count as hovering it. */
const MARKER_HIT = 14

type Hover = { n: number; x: number; y: number }

type RunState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: BacktestResult }

/** Large pop-up that runs a backtest, replays it candle by candle and ends with the stats. */
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

/**
 * Runs `run` on the API and animates the result. `run` must be referentially stable (kept in
 * state or memoized): a new object starts a new run.
 */
function ReplayPlayer({ run, onClose }: { run: ReplayRun; onClose: () => void }) {
  const [state, setState] = useState<RunState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const { locale, t, f } = useReplayText()

  useEffect(() => {
    const controller = new AbortController()
    const { mode, ...request } = run
    runBacktest(request, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return
        setState({ status: "ready", result })
        if (mode === "new") addBacktest(recordFromResult(request, result)).catch(() => {})
      },
      (error) => {
        if (!controller.signal.aborted) setState({ status: "error", message: describeBacktestError(error, locale) })
      }
    )
    return () => controller.abort()
  }, [run, attempt, locale])

  if (state.status === "ready") return <ReplayAnimation run={run} result={state.result} onClose={onClose} />

  const estimate = estimateCandles(run.from, run.to, run.timeframe)
  return (
    <>
      <ReplayHeader run={run} candles={`≈ ${f.count.format(estimate)} ${t("velas", "candles")}`}>
        {state.status === "loading" ? (
          <Badge variant="primary" className="hidden sm:inline-flex">
            <LoaderCircleIcon className="animate-spin" />
            {t("Calculando…", "Calculating…")}
          </Badge>
        ) : (
          <Badge variant="down" className="hidden sm:inline-flex">
            <AlertTriangleIcon />
            Error
          </Badge>
        )}
      </ReplayHeader>
      <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center md:min-h-96">
        {state.status === "loading" ? (
          <>
            <LoaderCircleIcon className="size-8 animate-spin text-primary" />
            <p className="font-semibold">{t("Calculando el backtest", "Calculating the backtest")}</p>
            <p className="max-w-sm text-caption text-muted-foreground">
              {t(
                "Descargando velas reales y aplicando las reglas de la estrategia. La primera vez que se usa un rango puede tardar unos segundos.",
                "Downloading real candles and applying the strategy's rules. The first time a range is used it may take a few seconds."
              )}
            </p>
          </>
        ) : (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-down-soft text-down">
              <AlertTriangleIcon className="size-5" />
            </span>
            <p className="font-semibold">{t("No se pudo ejecutar el backtest", "The backtest couldn't run")}</p>
            <p className="max-w-md text-caption text-muted-foreground">{state.message}</p>
            <LimitCta />
          </>
        )}
      </div>
      <footer className="flex justify-end gap-2 border-t px-4 py-3 md:px-5">
        <Button variant="outline" onClick={onClose}>
          {t("Cerrar", "Close")}
        </Button>
        {state.status === "error" && (
          <Button
            onClick={() => {
              setState({ status: "loading" })
              setAttempt((a) => a + 1)
            }}
          >
            <RotateCcwIcon data-icon="inline-start" />
            {t("Reintentar", "Retry")}
          </Button>
        )}
      </footer>
    </>
  )
}

function ReplayHeader({ run, candles, children }: { run: ReplayRun; candles: string; children: React.ReactNode }) {
  const { locale, t } = useI18n()
  return (
    <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
      <AssetAvatar symbol={run.symbol} size={40} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DialogTitle className="truncate text-title font-bold">
          {run.symbol}/USDT · {run.strategy.name}
        </DialogTitle>
        <DialogDescription className="num text-caption text-muted-foreground">
          {run.timeframe} · {formatDate(run.from, locale)} → {formatDate(run.to, locale)} · {candles} ·{" "}
          {run.mode === "new" ? t("Backtest ejecutado ahora", "Backtest run just now") : t("Revisión de backtest", "Backtest review")}
        </DialogDescription>
      </div>
      {children}
      <DialogClose />
    </header>
  )
}

function ReplayAnimation({ run, result, onClose }: { run: ReplayRun; result: BacktestResult; onClose: () => void }) {
  const steps = result.candles.length
  const candleCount = result.candleCount
  const seconds = Math.round(replayDuration(steps) / 1000)

  const [runKey, setRunKey] = useState(0)
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [pannable, setPannable] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const skipRef = useRef(false)
  const { locale, t, f } = useReplayText()
  const { amount, count, signedAmount } = f

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const duration = replayDuration(steps)
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
    const intraday = isIntraday(run.timeframe)
    const dateFormat = intraday ? f.axisDateTime : f.axisDate

    let raf = 0
    let visible = 1
    let stopped = false
    let finished = false
    /** End (exclusive) of the window while panning after the animation; null = follow the animation. */
    let panEnd: number | null = null
    let slotWidth = MIN_CANDLE_SLOT
    let windowCount = steps
    // Price scale of the window, eased between frames so it doesn't jump while scrolling.
    let scale: { min: number; max: number } | null = null
    // Screen position of the trade markers drawn in the last frame, for hover hit-testing.
    let markers: { n: number; x: number; y: number }[] = []

    const draw = (now: number, snap = false) => {
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
      const padR = 72
      const padT = 14
      const padB = 24
      const plotW = w - padL - padR
      const plotH = h - padT - padB

      // Candles on screen: as many as fit at MIN_CANDLE_SLOT (all of them in short runs).
      windowCount = Math.max(1, Math.min(steps, Math.floor(plotW / MIN_CANDLE_SLOT)))
      const viewEnd = panEnd === null ? visible : Math.round(Math.min(steps, Math.max(windowCount, panEnd)))
      const start = Math.min(Math.max(0, viewEnd - windowCount), steps - windowCount)
      const end = start + windowCount
      const slot = plotW / windowCount
      slotWidth = slot
      const x = (i: number) => padL + (i - start + 0.5) * slot

      let lo = Infinity
      let hi = -Infinity
      for (let i = start; i < end; i++) {
        lo = Math.min(lo, result.candles[i].low)
        hi = Math.max(hi, result.candles[i].high)
      }
      const margin = (hi - lo) * 0.06 || hi * 0.01
      if (!scale || snap) scale = { min: lo - margin, max: hi + margin }
      else {
        scale.min += (lo - margin - scale.min) * 0.2
        scale.max += (hi + margin - scale.max) * 0.2
      }
      const { min, max } = scale
      const y = (p: number) => padT + (1 - (p - min) / (max - min)) * plotH

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

      // Time axis: a few dates of the candles already revealed.
      ctx.textAlign = "center"
      ctx.fillStyle = colors.text
      const labelCount = Math.max(2, Math.min(5, Math.floor(plotW / 130)))
      const labelHalf = intraday ? 38 : 32
      for (let k = 0; k < labelCount; k++) {
        const i = start + Math.round((k * (windowCount - 1)) / (labelCount - 1))
        if (i >= visible) continue
        const lx = Math.min(Math.max(x(i), padL + labelHalf), w - padR - labelHalf)
        ctx.fillText(dateFormat.format(new Date(result.candles[i].time)), lx, h - padB / 2)
      }
      ctx.textAlign = "left"

      const body = Math.max(1, slot * 0.6)
      for (let i = start; i < Math.min(visible, end); i++) {
        const c = result.candles[i]
        ctx.fillStyle = ctx.strokeStyle = c.close >= c.open ? colors.up : colors.down
        ctx.beginPath()
        ctx.moveTo(x(i), y(c.high))
        ctx.lineTo(x(i), y(c.low))
        ctx.stroke()
        const top = y(Math.max(c.open, c.close))
        ctx.fillRect(x(i) - body / 2, top, body, Math.max(1, y(Math.min(c.open, c.close)) - top))
      }

      // Cursor on the candle being revealed + its close on the price axis.
      const cursor = visible - 1
      if (cursor >= start && cursor < end) {
        const current = result.candles[cursor]
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = colors.cursor
        ctx.beginPath()
        ctx.moveTo(x(cursor), padT)
        ctx.lineTo(x(cursor), h - padB)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = colors.fg
        ctx.fillRect(w - padR + 2, y(current.close) - 9, padR - 4, 18)
        ctx.fillStyle = colors.bg
        ctx.fillText(amount.format(current.close), w - padR + 6, y(current.close))
      }

      // Trade markers: pop-in + expanding ring when they appear.
      markers = []
      for (const [n, trade] of result.trades.entries()) {
        if (trade.index >= visible) break
        if (!appeared.has(n)) appeared.set(n, now)
        if (trade.index < start || trade.index >= end) continue
        const age = now - appeared.get(n)!
        const buy = trade.side === "buy"
        const c = result.candles[trade.index]
        const cx = x(trade.index)
        const cy = buy ? y(c.low) + 12 : y(c.high) - 12
        const pop = age < 280 ? 1 + 0.35 * Math.sin((age / 280) * Math.PI) : 1
        const size = 6 * Math.min(1, age / 120 + 0.2) * pop
        markers.push({ n, x: cx, y: cy })
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
      if (skipped) result.trades.forEach((_, n) => appeared.set(n, -Infinity))
      setStep(visible)
      draw(now, skipped)
      if (p >= 1 && !finished) {
        finished = true
        setPannable(steps > windowCount)
        setDone(true)
      }
      // Keep painting a bit after the end so the last markers finish their pulse.
      if (!(p >= 1 && (skipped || now - start >= duration + 800))) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const observer = new ResizeObserver(() => {
      setHover(null)
      draw(performance.now(), true)
    })
    observer.observe(canvas)

    // Once finished, drag (or scroll) to look at the earlier candles of the run.
    const panBy = (candles: number) => {
      if (!finished || steps <= windowCount) return
      panEnd = Math.min(steps, Math.max(windowCount, (panEnd ?? steps) - candles))
      draw(performance.now(), true)
    }
    let dragX: number | null = null
    const onDown = (e: PointerEvent) => {
      if (!finished) return
      dragX = e.clientX
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (dragX === null) {
        if (!finished) return
        const rect = canvas.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        let best: Hover | null = null
        let bestDist = MARKER_HIT
        for (const m of markers) {
          const d = Math.hypot(m.x - px, m.y - py)
          if (d <= bestDist) {
            bestDist = d
            best = { n: m.n, x: m.x, y: m.y }
          }
        }
        canvas.style.cursor = best ? "pointer" : ""
        setHover((prev) => (prev?.n === best?.n ? prev : best))
        return
      }
      setHover(null)
      panBy((e.clientX - dragX) / slotWidth)
      dragX = e.clientX
    }
    const onUp = () => {
      dragX = null
    }
    const onLeave = () => {
      canvas.style.cursor = ""
      setHover(null)
    }
    const onWheel = (e: WheelEvent) => {
      if (!finished || steps <= windowCount) return
      e.preventDefault()
      setHover(null)
      panBy(-(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / slotWidth)
    }
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("pointerleave", onLeave)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("pointerleave", onLeave)
    }
  }, [result, steps, candleCount, runKey, run.timeframe, f, amount])

  const i = step - 1
  const progress = step / steps
  const lastTrade = result.trades.findLast((t) => t.index <= i)

  const restart = () => {
    skipRef.current = false
    setDone(false)
    setHover(null)
    setPannable(false)
    setStep(1)
    setRunKey((k) => k + 1)
  }

  return (
    <>
      <ReplayHeader run={run} candles={`${count.format(candleCount)} ${t("velas", "candles")}`}>
        <Badge variant={done ? "up" : "primary"} className="hidden sm:inline-flex">
          {done ? <CheckCircle2Icon /> : <LoaderCircleIcon className="animate-spin" />}
          {done ? t("Completado", "Done") : t("Ejecutando…", "Running…")}
        </Badge>
      </ReplayHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-5">
        <div className="flex flex-col gap-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="num flex justify-between gap-3 text-caption text-muted-foreground">
            <span>{formatDate(result.candles[i].time, locale)}</span>
            <span>
              {t("Vela", "Candle")} {count.format(Math.round(progress * candleCount))} / {count.format(candleCount)} ·{" "}
              {Math.round(progress * 100)}%
            </span>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Live label={t("Precio", "Price")} value={formatPrice(result.candles[i].close, locale)} />
          <Live label={t("Compras", "Buys")} value={String(result.buys[i])} tone="up" />
          <Live label={t("Ventas", "Sells")} value={String(result.sells[i])} tone="down" />
          <Live
            label={t("PnL realizado", "Realized PnL")}
            value={`${signedAmount.format(result.realized[i])} USDT`}
            tone={sign(result.realized[i])}
          />
          <Live label={t("Capital", "Equity")} value={`${amount.format(result.equity[i])} USDT`} />
        </dl>

        <div className="relative h-72 overflow-hidden rounded-lg border bg-background md:h-96">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t("Animación de velas y operaciones de la estrategia", "Animation of the candles and the strategy's trades")}
            className={cn("size-full touch-pan-y", pannable && "cursor-grab active:cursor-grabbing")}
          />
          {pannable && (
            <p className="pointer-events-none absolute top-2 right-20 text-caption text-muted-foreground">
              {t("Arrastra para ver el resto de velas", "Drag to see the other candles")}
            </p>
          )}
          {done && hover && (
            <TradeTooltip
              trade={result.trades[hover.n]}
              rules={run.strategy.rules}
              intraday={isIntraday(run.timeframe)}
              x={hover.x}
              y={hover.y}
            />
          )}
          <div className="pointer-events-none absolute top-2 left-3 flex flex-wrap items-center gap-2 text-caption">
            <span className="inline-flex items-center gap-1 text-up">▲ {t("Compra", "Buy")}</span>
            <span className="inline-flex items-center gap-1 text-down">▼ {t("Venta", "Sell")}</span>
            {lastTrade && (
              <Badge
                key={lastTrade.time}
                variant={lastTrade.side === "buy" ? "up" : "down"}
                className="num motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:slide-in-from-left-2"
              >
                {lastTrade.side === "buy" ? t("Compra", "Buy") : t("Venta", "Sell")} {t("a", "at")} {formatPrice(lastTrade.price, locale)}
              </Badge>
            )}
          </div>
        </div>

        {done && <Results result={result} />}
      </div>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <p className="num text-caption text-muted-foreground">
          {done
            ? t(
                `Capital inicial ${amount.format(run.strategy.initialCapital)} USDT · comisión ${amount.format(run.strategy.feePct)} % por orden · órdenes al cierre de la vela.`,
                `Initial capital ${amount.format(run.strategy.initialCapital)} USDT · ${amount.format(run.strategy.feePct)}% fee per order · orders at the candle close.`
              )
            : t(
                `La animación dura ≈ ${seconds} s según las velas analizadas.`,
                `The animation lasts ≈ ${seconds} s depending on the candles analyzed.`
              )}
        </p>
        <div className="flex gap-2 self-end">
          {done ? (
            <>
              <Button variant="outline" onClick={restart}>
                <RotateCcwIcon data-icon="inline-start" />
                {t("Repetir animación", "Replay animation")}
              </Button>
              <Button onClick={onClose}>{t("Cerrar", "Close")}</Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                skipRef.current = true
              }}
            >
              <SkipForwardIcon data-icon="inline-start" />
              {t("Omitir animación", "Skip animation")}
            </Button>
          )}
        </div>
      </footer>
    </>
  )
}

/** Hover card of a trade marker: price, date, and the rule/condition that fired it. */
function TradeTooltip({
  trade,
  rules,
  intraday,
  x,
  y,
}: {
  trade: BacktestResult["trades"][number]
  rules: Rule[]
  intraday: boolean
  x: number
  y: number
}) {
  const { locale, t, f } = useReplayText()
  const buy = trade.side === "buy"
  const rule = rules.find((r) => r.id === trade.ruleId)
  const position = rule ? rules.filter((r) => r.side === rule.side).indexOf(rule) + 1 : 0
  const date = intraday ? f.tradeDateTime.format(new Date(trade.time)) : formatDate(trade.time, locale)
  const name = rule ? ruleName(rule.side, position, locale) : ""
  // Measured after render so the card always stays inside the chart: above the marker when it
  // fits, below otherwise, and clamped horizontally and vertically.
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent
    if (!el || !parent) return
    const margin = 8
    const gap = 16
    const w = el.offsetWidth
    const h = el.offsetHeight
    const maxLeft = Math.max(margin, parent.clientWidth - w - margin)
    const left = Math.min(Math.max(margin, x - w / 2), maxLeft)
    const above = y - gap - h
    const belowTop = y + gap
    let top = above >= margin ? above : belowTop
    if (top + h > parent.clientHeight - margin) top = Math.max(margin, parent.clientHeight - h - margin)
    setPos({ left, top })
  }, [x, y, trade])
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-10 w-64 max-w-[calc(100%-1rem)] rounded-lg border bg-popover p-3 text-caption text-popover-foreground shadow-lg"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      <p className={cn("mb-1.5 font-bold", buy ? "text-up" : "text-down")}>{buy ? t("Compra", "Buy") : t("Venta", "Sell")}</p>
      <dl className="num flex flex-col gap-1">
        <TipRow label={t("Precio", "Price")} value={formatPrice(trade.price, locale)} />
        <TipRow label={t("Fecha", "Date")} value={`${date}${intraday ? " UTC" : ""}`} />
        <TipRow
          label={t("Condición", "Condition")}
          value={rule ? describeConditions(rule, locale) : t("Regla eliminada", "Deleted rule")}
        />
        <TipRow
          label={t("Regla", "Rule")}
          value={rule ? `${name[0].toUpperCase()}${name.slice(1)} · ${describeSize(rule, locale)}` : "—"}
        />
      </dl>
    </div>
  )
}

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
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
function Results({ result }: { result: BacktestResult }) {
  const { t, f } = useReplayText()
  const { amount, count, signedAmount } = f
  const pct = t(" %", "%")
  const s = result.stats
  const tiles: { label: string; value: string; tone?: "up" | "down"; hint?: string }[] = [
    { label: t("Compras", "Buys"), value: String(s.buys) },
    { label: t("Ventas", "Sells"), value: String(s.sells) },
    { label: t("PnL realizado", "Realized PnL"), value: `${signedAmount.format(s.realizedPnl)} USDT`, tone: sign(s.realizedPnl) },
    {
      label: t("PnL no realizado", "Unrealized PnL"),
      value: `${signedAmount.format(s.unrealizedPnl)} USDT`,
      tone: sign(s.unrealizedPnl),
      hint: s.openPosition ? t("Posición abierta", "Open position") : t("Sin posición abierta", "No open position"),
    },
    { label: t("Rentabilidad total", "Total return"), value: `${signedAmount.format(s.returnPct)}${pct}`, tone: sign(s.returnPct) },
    { label: t("Capital final", "Final equity"), value: `${amount.format(s.finalCapital)} USDT` },
    { label: t("Tasa de acierto", "Win rate"), value: `${amount.format(s.winRatePct)}${pct}`, hint: t("Ventas con beneficio", "Profitable sells") },
    {
      label: t("Drawdown máx.", "Max drawdown"),
      value: `−${amount.format(s.maxDrawdownPct)}${pct}`,
      tone: s.maxDrawdownPct > 0 ? "down" : undefined,
    },
  ]
  return (
    <section
      aria-label={t("Estadísticas del backtest", "Backtest statistics")}
      className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-500"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-title font-bold">{t("Resultados", "Results")}</h3>
        <span className="num text-caption text-muted-foreground">
          {count.format(result.candleCount)} {t("velas analizadas", "candles analyzed")} · Sharpe {amount.format(s.sharpe)}
        </span>
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
