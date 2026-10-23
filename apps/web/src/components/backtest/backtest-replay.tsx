"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { AlertTriangleIcon, CheckCircle2Icon, LoaderCircleIcon, Maximize2Icon, MaximizeIcon, Minimize2Icon, PauseIcon, RotateCcwIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { LimitCta } from "@/components/plan/plan-usage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { liveFigures, liveTrack, previousRun, reliabilityWarnings, verdict } from "@/lib/backtest-report"
import { describeBacktestError, recordFromResult, runBacktest, type BacktestRequest, type BacktestResult } from "@/lib/backtests"
import { estimateCandles, isIntraday } from "@/lib/candles"
import { clamp, easeInOutCubic, lerp, phase } from "@/lib/chart-geometry"
import { formatDate } from "@/lib/format"
import { useHeight, useMediaQuery, useReducedMotion, useWidth } from "@/lib/motion"
import { addBacktest, useRecentBacktests } from "@/lib/storage/backtests"
import { AdvancedMetrics, TradesTable } from "./report/trades-table"
import { DistributionChart, PeriodChart, TradeResultsChart, WinLossChart } from "./report/charts"
import { ExportMenu } from "./report/export-menu"
import { KeyMetrics } from "./report/key-metrics"
import { InfoHint } from "./report/parts"
import { RulesPanel } from "./report/rules-panel"
import { TradeDetailDialog } from "./report/trade-detail"
import { VerdictNotes, VerdictPanel } from "./report/verdict-panel"
import { DockLayer, dockFade, dockLanded, dockRest } from "./replay/dock"
import { useReplayText } from "./replay/format"
import { LiveKpis, PlaybackBar, useLiveTiles } from "./replay/live-panels"
import { liveWindow, MIN_VIEW, PriceChart, type View } from "./replay/price-chart"
import { DrawdownChart, EquityChart } from "./replay/series-charts"
import { SPEEDS, useSince, usePlayback, type Speed } from "./replay/use-playback"

export type ReplayRun = BacktestRequest & {
  /** "new": just executed (saved to the history); "review": re-run from the history. */
  mode: "new" | "review"
  /** History record being reviewed (so "previous run" never compares a run with itself). */
  recordId?: string
}

/** A replay opens filling the whole window; `ExpandButton` shrinks it to a wide dialog and back. */
export const REPLAY_DIALOG_CLASS = "h-dvh max-h-dvh w-screen rounded-none border-0"

/**
 * Seconds of the transition from the replay to the report: zoom out, light sweep, verdict, and
 * the dock (the live tiles fly to the key figures while the charts take their column).
 */
const SETTLE = { zoom: 0.9, sweep: 0.5, verdict: 0.9, dock: { start: 1, length: 1.5 }, end: 2.7 }

// The settle animation re-renders the whole view every frame; the heavy parts only depend on
// things that stay put by then, so they skip those renders.
const MemoPriceChart = memo(PriceChart)
const MemoEquityChart = memo(EquityChart)
const MemoDrawdownChart = memo(DrawdownChart)
const MemoKeyMetrics = memo(KeyMetrics)
const MemoTradeResultsChart = memo(TradeResultsChart)
const MemoDistributionChart = memo(DistributionChart)
const MemoPeriodChart = memo(PeriodChart)
const MemoWinLossChart = memo(WinLossChart)
const MemoTradesTable = memo(TradesTable)
const MemoRulesPanel = memo(RulesPanel)
const MemoAdvancedMetrics = memo(AdvancedMetrics)

type RunState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: BacktestResult; recordId?: string }

/** Large pop-up that runs a backtest, replays it candle by candle and turns into its report. */
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
      <DialogContent className={REPLAY_DIALOG_CLASS}>
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
  const [expanded, setExpanded] = useState(true)
  const { locale, t, f } = useReplayText()

  useEffect(() => {
    const controller = new AbortController()
    const { mode, recordId, ...request } = run
    runBacktest(request, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return
        if (mode === "new") {
          const record = recordFromResult(request, result)
          setState({ status: "ready", result, recordId: record.id })
          addBacktest(record).catch(() => {})
        } else setState({ status: "ready", result, recordId })
      },
      (error) => {
        if (!controller.signal.aborted) setState({ status: "error", message: describeBacktestError(error, locale) })
      }
    )
    return () => controller.abort()
  }, [run, attempt, locale])

  if (state.status === "ready") {
    return <ReplayView run={run} result={state.result} recordId={state.recordId} onClose={onClose} expanded={expanded} onExpandedChange={setExpanded} />
  }

  const estimate = estimateCandles(run.from, run.to, run.timeframe)
  return (
    <>
      <ReplayHeader run={run} candles={`≈ ${f.count.format(estimate)} ${t("velas", "candles")}`} expanded={expanded} onExpandedChange={setExpanded}>
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
            <LoadingArt />
            <p className="font-semibold">{t("Calculando el backtest", "Calculating the backtest")}</p>
            <p className="max-w-sm text-caption text-muted-foreground">
              {t(
                "Leyendo velas reales y aplicando las reglas de la estrategia vela a vela. Con rangos largos puede tardar unos segundos.",
                "Reading real candles and applying the strategy's rules candle by candle. Long ranges may take a few seconds."
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

/** Candles rising in a loop while the engine works (CSS only, still with reduced motion). */
function LoadingArt() {
  const bars = [0.45, 0.7, 0.55, 0.85, 0.6, 1, 0.75]
  return (
    <svg viewBox="0 0 84 48" className="h-12 w-20" aria-hidden>
      {bars.map((h, i) => (
        <rect
          key={i}
          className="lp-anim lp-box"
          x={4 + i * 11}
          y={44 - h * 40}
          width={7}
          height={h * 40}
          rx={1.5}
          fill={i % 3 === 1 ? "var(--down)" : "var(--up)"}
          style={{ animation: `lp-breathe 1.4s ease-in-out ${i * 0.12}s infinite`, transformOrigin: "50% 100%" } as CSSProperties}
        />
      ))}
    </svg>
  )
}

/**
 * Switches the dialog between the whole window (its default size) and a wide dialog with margins
 * (inline styles on the popup, undone when it goes back to full or closes).
 */
function ExpandButton({ expanded, onChange }: { expanded: boolean; onChange: (expanded: boolean) => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const dialog = ref.current?.closest<HTMLElement>('[data-slot="dialog-content"]')
    if (!dialog || expanded) return
    const { style } = dialog
    style.width = "min(84rem, calc(100vw - 1.5rem))"
    style.height = "calc(100dvh - 2rem)"
    style.maxHeight = "calc(100dvh - 2rem)"
    style.borderRadius = "var(--radius-xl)"
    style.borderWidth = "1px"
    return () => ["width", "height", "max-height", "border-radius", "border-width"].forEach((key) => style.removeProperty(key))
  }, [expanded])
  const label = expanded ? t("Reducir ventana", "Shrink window") : t("Ampliar ventana", "Enlarge window")
  return (
    <Button ref={ref} type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} aria-pressed={expanded} onClick={() => onChange(!expanded)} data-print-hide>
      {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
    </Button>
  )
}

function ReplayHeader({
  run,
  candles,
  expanded,
  onExpandedChange,
  children,
}: {
  run: ReplayRun
  candles: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  children: React.ReactNode
}) {
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
      <ExpandButton expanded={expanded} onChange={onExpandedChange} />
      <DialogClose data-print-hide />
    </header>
  )
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=menu]") !== null)

function ReplayView({
  run,
  result,
  recordId,
  onClose,
  expanded,
  onExpandedChange,
}: {
  run: ReplayRun
  result: BacktestResult
  recordId?: string
  onClose: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const { locale, t, f } = useReplayText()
  const reduced = useReducedMotion()
  const steps = result.candles.length
  const playback = usePlayback(steps, reduced)
  const { finished } = playback
  const since = useSince(finished, SETTLE.end, reduced)
  const capital = run.strategy.initialCapital
  const intraday = isIntraday(run.timeframe)
  const track = useMemo(() => liveTrack(result), [result])
  const { data: history } = useRecentBacktests()
  const reportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const chartColumn = useRef<HTMLDivElement>(null)
  const columnWidth = useWidth(chartColumn)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollHeight = useHeight(scrollRef)
  const dockRef = useRef<HTMLDivElement>(null)
  const [userView, setUserView] = useState<View | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<number | null>(null)

  const request: BacktestRequest = { symbol: run.symbol, timeframe: run.timeframe, from: run.from, to: run.to, strategy: run.strategy }
  const summary = useMemo(
    () => ({ verdict: verdict(result), warnings: reliabilityWarnings(result) }),
    [result]
  )
  const previous = useMemo(
    () =>
      history
        ? previousRun(
            history,
            { symbol: run.symbol, timeframe: run.timeframe, from: run.from, to: run.to, strategy: run.strategy },
            result.stats,
            recordId
          )
        : null,
    [history, run, result, recordId]
  )

  // Price view: a window that follows the playhead, zooming out to the whole run when it ends;
  // then the user's own zoom/pan.
  const windowCount = liveWindow(columnWidth || 800, steps)
  const liveView = (pos: number): View => {
    if (steps <= windowCount) return { start: 0, end: steps }
    const end = clamp(pos + 2, windowCount, steps)
    return { start: end - windowCount, end }
  }
  const full = useMemo<View>(() => ({ start: 0, end: steps }), [steps])
  let view: View
  if (!finished) view = liveView(playback.pos)
  else if (since < SETTLE.zoom) {
    const from = liveView(steps)
    const u = easeInOutCubic(clamp(since / SETTLE.zoom))
    view = { start: lerp(from.start, 0, u), end: lerp(from.end, steps, u) }
  } else view = userView ?? full
  const live = !finished
  const revealed = playback.pos
  const index = Math.max(0, Math.min(steps - 1, Math.ceil(revealed) - 1))
  const figures = liveFigures(result, track, capital, index)
  const lastN = result.trades.findLastIndex((trade) => trade.index <= index && trade.index < Math.ceil(revealed))
  const lastTrade = lastN >= 0 ? { trade: result.trades[lastN], n: lastN } : null
  const showVerdict = finished && since >= SETTLE.verdict
  // The dock: 0 until the tiles start to fly, 1 once they landed (and with reduced motion).
  const tiles = useLiveTiles(figures)
  const dockU = finished ? phase(since, SETTLE.dock.start, SETTLE.dock.length) : 0
  const docking = dockU > 0 && dockU < 1
  // Wide screens: the column that held the tiles takes the verdict once they have left. Narrow
  // ones: the column folds away and the verdict stays on top of the report.
  const wide = useMediaQuery("(min-width: 1024px)")
  const sideVerdict = wide && finished && dockU >= 0.3
  const asideShown = wide || dockU < 1
  const rest = finished && !wide ? dockRest(dockU) : 1

  const restart = () => {
    setUserView(null)
    setSelected(null)
    setDetail(null)
    reportRef.current?.closest("[data-report-scroll]")?.scrollTo({ top: 0 })
    playback.restart()
  }

  const focusTrip = useCallback(
    (k: number) => {
      const trip = result.roundTrips[k]
      if (!trip) return
      setSelected(k)
      const length = trip.exitIndex - trip.entryIndex + 1
      const span = clamp(Math.max(length * 3, MIN_VIEW * 2, 40), Math.min(MIN_VIEW, steps), steps)
      const centre = (trip.entryIndex + trip.exitIndex + 1) / 2
      const start = clamp(centre - span / 2, 0, steps - span)
      setUserView({ start, end: start + span })
      stageRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
    },
    [result, steps, reduced]
  )

  // Keyboard: space play/pause, ←/→ move (Shift: previous/next trade), 1/2/4 speed, End/S summary, R replay.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || detail !== null) return
      const onControl = e.target instanceof HTMLElement && e.target.closest("button, [role=slider], summary, a, tr[tabindex]")
      if (finished) {
        if (e.key === "r" || e.key === "R") restart()
        return
      }
      if (e.key === " " && !onControl) playback.toggle()
      else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !onControl) {
        const forward = e.key === "ArrowRight"
        if (e.shiftKey) {
          const at = Math.ceil(playback.pos) - 1
          const target = forward
            ? result.trades.find((trade) => trade.index > at)
            : result.trades.findLast((trade) => trade.index < at - 1)
          playback.seek(target ? target.index + 1 : forward ? steps : 0)
        } else playback.seek(playback.pos + (forward ? 1 : -1) * steps * 0.02)
      } else if (SPEEDS.includes(Number(e.key) as Speed)) playback.setSpeed(Number(e.key) as Speed)
      else if (e.key === "End" || e.key === "s" || e.key === "S") playback.skip()
      else if (e.key === "r" || e.key === "R") restart()
      else return
      e.preventDefault()
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  const status = finished
    ? { variant: "up" as const, icon: <CheckCircle2Icon />, text: t("Completado", "Done") }
    : playback.playing
      ? { variant: "primary" as const, icon: <LoaderCircleIcon className="animate-spin" />, text: t("Reproduciendo", "Replaying") }
      : { variant: "default" as const, icon: <PauseIcon />, text: t("En pausa", "Paused") }
  const narrow = columnWidth > 0 && columnWidth < 640
  const equityHeight = narrow ? 120 : 150
  const drawdownHeight = narrow ? 76 : 96
  // While it plays the stage fills the dialog (the price chart takes what's left); the height is
  // kept for the report so nothing jumps when the replay ends.
  const fitted = scrollHeight - equityHeight - drawdownHeight - 48
  const [priceHeight, setPriceHeight] = useState(0)
  const targetPrice = narrow ? 230 : clamp(fitted, 260, 520)
  if (!finished && scrollHeight > 0 && Math.abs(priceHeight - targetPrice) > 1) setPriceHeight(targetPrice)
  const panelLabel = (es: string, en: string) => t(es, en)

  return (
    <>
      <ReplayHeader run={run} candles={`${f.count.format(result.candleCount)} ${t("velas", "candles")}`} expanded={expanded} onExpandedChange={onExpandedChange}>
        <Badge variant={status.variant} className="hidden sm:inline-flex">
          {status.icon}
          {status.text}
        </Badge>
      </ReplayHeader>

      <div ref={scrollRef} data-report-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div ref={reportRef} data-report className="flex flex-col gap-4 bg-card p-3 sm:p-4 md:p-5">
          <p className="hidden text-title font-bold [.bt-exporting_&]:block">
            {run.symbol}/USDT · {run.strategy.name} · {run.timeframe} · {formatDate(run.from, locale)} → {formatDate(run.to, locale)}
          </p>

          {finished && !wide && (
            <div
              className="grid transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
              style={{ gridTemplateRows: showVerdict ? "1fr" : "0fr", opacity: showVerdict ? 1 : 0 }}
            >
              <div className="min-h-0 overflow-hidden">
                {showVerdict && (
                  <VerdictPanel verdict={summary.verdict} warnings={summary.warnings} previous={previous} result={result} />
                )}
              </div>
            </div>
          )}

          <div ref={dockRef} className="relative flex flex-col gap-4">
            <section
              ref={stageRef}
              aria-label={t("Reproducción del backtest", "Backtest replay")}
              className="relative scroll-mt-4 overflow-hidden rounded-xl border bg-card shadow-xl shadow-primary/5 ring-1 ring-foreground/[0.03]"
            >
              {finished && (
                <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                  <h3 className="flex items-center gap-1.5 font-bold">
                    {t("Precio, capital y caídas", "Price, equity and drawdowns")}
                    <InfoHint title={t("Cómo leer estos gráficos", "How to read these charts")}>
                      <p>
                        {t(
                          "Arriba, las velas con cada compra (▲) y venta (▼). Las zonas sombreadas son el tiempo con dinero invertido: verdes si esa operación ganó, rojas si perdió.",
                          "Top: the candles with every buy (▲) and sell (▼). Shaded zones are the time with money invested: green if that trade won, red if it lost."
                        )}
                      </p>
                      <p>
                        {t(
                          "En medio, tu capital (azul) frente a comprar al inicio y mantener (gris discontinuo). Abajo, cuánto estaba por debajo de su máximo en cada momento.",
                          "Middle: your capital (blue) against buying at the start and holding (dashed grey). Bottom: how far below its peak it was at each moment."
                        )}
                      </p>
                      <p>{t("Rueda del ratón: zoom. Arrastrar: mover. Doble clic: ver todo.", "Mouse wheel: zoom. Drag: move. Double click: see all.")}</p>
                    </InfoHint>
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-[11px] text-muted-foreground md:inline" data-print-hide>
                      {t("Rueda: zoom · Arrastra: mover", "Wheel: zoom · Drag: move")}
                    </span>
                    {userView && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setUserView(null)
                          setSelected(null)
                        }}
                        data-print-hide
                      >
                        <MaximizeIcon data-icon="inline-start" />
                        {t("Ver todo", "See all")}
                      </Button>
                    )}
                  </div>
                </header>
              )}
              <div
                className={cn("grid", asideShown && "lg:grid-cols-[minmax(0,1fr)_19rem]")}
              >
                <div ref={chartColumn} className="flex min-w-0 flex-col divide-y">
                  <MemoPriceChart
                    result={result}
                    rules={run.strategy.rules}
                    intraday={intraday}
                    view={view}
                    revealed={revealed}
                    cps={playback.cps}
                    live={live}
                    height={priceHeight || targetPrice}
                    highlight={selected}
                    onViewChange={finished && since >= SETTLE.zoom ? setUserView : undefined}
                    label={panelLabel(
                      `Velas de ${run.symbol}/USDT con las compras y ventas de la estrategia`,
                      `${run.symbol}/USDT candles with the strategy's buys and sells`
                    )}
                  />
                  <MemoEquityChart
                    result={result}
                    capital={capital}
                    view={finished ? view : full}
                    revealed={revealed}
                    live={live}
                    height={equityHeight}
                    interactive={finished}
                    label={panelLabel("Capital de la estrategia frente a comprar y mantener", "Strategy equity against buy and hold")}
                  />
                  <MemoDrawdownChart
                    result={result}
                    view={finished ? view : full}
                    revealed={revealed}
                    cps={playback.cps}
                    live={live}
                    height={drawdownHeight + (finished ? 16 : 0)}
                    interactive={finished}
                    showLongest={finished}
                    label={panelLabel("Caída del capital desde su máximo", "Equity drawdown from its peak")}
                  />
                </div>
                {asideShown && (
                  <aside
                    className="relative grid overflow-hidden border-t lg:border-t-0 lg:border-l"
                    style={wide ? undefined : { gridTemplateRows: `minmax(0, ${rest}fr)` }}
                  >
                    <div
                      className="min-h-0 overflow-hidden p-3 lg:absolute lg:inset-0 lg:overflow-y-auto"
                      style={docking && !sideVerdict ? { opacity: 1 - dockFade(dockU) } : undefined}
                    >
                      {sideVerdict ? (
                        <VerdictPanel side verdict={summary.verdict} warnings={summary.warnings} previous={previous} result={result} />
                      ) : (
                        <LiveKpis tiles={tiles} lastTrade={lastTrade} result={result} />
                      )}
                    </div>
                  </aside>
                )}
              </div>
              {/* The light sweep of the transition to the report. */}
              {finished && since > SETTLE.sweep && since < SETTLE.end && (
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="bt-sweep absolute inset-0 bg-[linear-gradient(90deg,transparent_30%,color-mix(in_oklch,var(--primary)_14%,transparent)_50%,transparent_70%)]" />
                </div>
              )}
              <p className="sr-only" aria-live="polite">
                {live && lastTrade
                  ? `${lastTrade.trade.side === "buy" ? t("Compra", "Buy") : t("Venta", "Sell")} ${f.price(lastTrade.trade.price)}`
                  : ""}
              </p>
            </section>

            {finished && (
              <>
                {wide && previous && (
                  // Its room is kept from the start so nothing moves while the tiles fly.
                  <div
                    aria-hidden={!sideVerdict}
                    className="flex flex-col gap-2 transition-opacity duration-700"
                    style={{ opacity: sideVerdict ? 1 : 0 }}
                  >
                    <VerdictNotes only="previous" warnings={summary.warnings} previous={previous} result={result} />
                  </div>
                )}
                <MemoKeyMetrics result={result} capital={capital} landed={dockLanded(dockU)} />
                <div className="grid gap-4 md:grid-cols-2">
                  <MemoTradeResultsChart result={result} selected={selected} onSelect={focusTrip} />
                  <MemoDistributionChart result={result} />
                  <MemoPeriodChart result={result} />
                  <MemoWinLossChart result={result} />
                </div>
                <div data-export-skip>
                  <MemoTradesTable result={result} rules={run.strategy.rules} intraday={intraday} selected={selected} onSelect={focusTrip} onDetail={setDetail} />
                </div>
                <MemoRulesPanel rules={run.strategy.rules} />
                <div data-export-skip>
                  <MemoAdvancedMetrics result={result} />
                </div>
                <p className="num text-caption text-muted-foreground">
                  {t(
                    `Capital inicial ${f.usdt(capital)} · comisión ${f.amount.format(run.strategy.feePct)} % por orden · cada señal se ejecuta a la apertura de la vela siguiente · ${f.count.format(result.candleCount)} velas reales. Resultados sobre datos históricos: no garantizan resultados futuros.`,
                    `Initial capital ${f.usdt(capital)} · ${f.amount.format(run.strategy.feePct)}% fee per order · each signal fills at the next candle's open · ${f.count.format(result.candleCount)} real candles. Results on historical data: they don't guarantee future results.`
                  )}
                </p>
              </>
            )}
            {docking && <DockLayer u={dockU} host={dockRef} tiles={tiles} />}
          </div>
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t px-3 py-3 sm:px-4 md:px-5" data-print-hide>
        {finished ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={restart}>
              <RotateCcwIcon data-icon="inline-start" />
              {t("Repetir animación", "Replay animation")}
            </Button>
            <ExportMenu report={reportRef} request={request} result={result} />
            <Button onClick={onClose}>{t("Cerrar", "Close")}</Button>
          </div>
        ) : (
          <PlaybackBar playback={playback} result={result} intraday={intraday} />
        )}
      </footer>

      <TradeDetailDialog k={detail} result={result} rules={run.strategy.rules} intraday={intraday} onClose={() => setDetail(null)} />
    </>
  )
}

export { BacktestReplayDialog, ReplayPlayer }
