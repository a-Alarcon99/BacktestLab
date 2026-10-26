"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangleIcon, CheckCircle2Icon, DownloadIcon, LoaderCircleIcon, PauseIcon, RotateCcwIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { LimitCta } from "@/components/plan/plan-usage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { batchCsv, batchRows, batchSummary } from "@/lib/batch-report"
import { describeBacktestError, recordFromBatch, runBatch, type AssetsBatchRequest, type AssetsBatchResult } from "@/lib/backtests"
import { easeOutCubic, phase } from "@/lib/chart-geometry"
import { formatDate } from "@/lib/format"
import { useReducedMotion } from "@/lib/motion"
import { addBacktest } from "@/lib/storage/backtests"
import { ExpandButton, LoadingArt, REPLAY_DIALOG_CLASS, ReplayPlayer, type ReplayRun } from "../backtest-replay"
import { useReplayText } from "../replay/format"
import { TimelineBar } from "../replay/live-panels"
import { SPEEDS, usePlayback, useSince, type Speed } from "../replay/use-playback"
import { BatchReading, BatchTable, BatchVerdict, CurvesOverlay, RiskReturn, StrategyVsHold } from "./batch-results"
import { buildTiles, returnDomain, STEPS, timeAt, timelineOf } from "./multi-data"
import { AssetTile, LiveSummary, RankingPanel } from "./multi-parts"

export type MultiRun = AssetsBatchRequest & {
  /** "new": just executed (saved to the history); "review": re-run from the history (free). */
  mode: "new" | "review"
}

/** Seconds of the transition from the replay to the results. */
const SETTLE = 1.6

type RunState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: AssetsBatchResult }

/** Dialog around the player, for the history rows. */
export function MultiReplayDialog({ open, onOpenChange, run }: { open: boolean; onOpenChange: (open: boolean) => void; run: MultiRun }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={REPLAY_DIALOG_CLASS}>
        <MultiReplayPlayer run={run} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Runs the same strategy over several assets and animates all of them on one clock. `run` must be
 * referentially stable (kept in state or memoized): a new object starts a new run.
 */
export function MultiReplayPlayer({ run, onClose }: { run: MultiRun; onClose: () => void }) {
  const [state, setState] = useState<RunState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const { locale, t } = useReplayText()

  useEffect(() => {
    const controller = new AbortController()
    const { mode, ...request } = run
    runBatch(request, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return
        setState({ status: "ready", result })
        if (mode === "new") addBacktest(recordFromBatch(request, result)).catch(() => {})
      },
      (error) => {
        if (!controller.signal.aborted) setState({ status: "error", message: describeBacktestError(error, locale) })
      }
    )
    return () => controller.abort()
  }, [run, attempt, locale])

  if (state.status === "ready") {
    return <MultiView run={run} result={state.result} onClose={onClose} expanded={expanded} onExpandedChange={setExpanded} />
  }
  return (
    <>
      <MultiHeader run={run} expanded={expanded} onExpandedChange={setExpanded}>
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
      </MultiHeader>
      <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center md:min-h-96">
        {state.status === "loading" ? (
          <>
            <LoadingArt />
            <p className="font-semibold">{t(`Calculando ${run.symbols.length} backtests`, `Calculating ${run.symbols.length} backtests`)}</p>
            <p className="max-w-sm text-caption text-muted-foreground">
              {t(
                "Cada activo se simula por separado con el capital completo, vela a vela. Con muchos activos o rangos largos puede tardar unos segundos.",
                "Each asset is simulated on its own with the full capital, candle by candle. With many assets or long ranges it may take a few seconds."
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

function MultiHeader({
  run,
  expanded,
  onExpandedChange,
  children,
}: {
  run: MultiRun
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  children: React.ReactNode
}) {
  const { locale, t } = useI18n()
  const shown = run.symbols.slice(0, 3)
  return (
    <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
      <span className="flex shrink-0 -space-x-3" aria-hidden>
        {shown.map((symbol) => (
          <AssetAvatar key={symbol} symbol={symbol} size={40} className="ring-2 ring-card" />
        ))}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <DialogTitle className="truncate text-title font-bold">
          {t(`${run.symbols.length} activos`, `${run.symbols.length} assets`)} · {run.strategy.name}
        </DialogTitle>
        <DialogDescription className="num text-caption text-muted-foreground">
          {run.timeframe} · {formatDate(run.from, locale)} → {formatDate(run.to, locale)} ·{" "}
          {run.mode === "new" ? t("Ejecutado ahora, cada activo con el capital completo", "Run just now, each asset with the full capital") : t("Revisión de backtest", "Backtest review")}
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

const download = (name: string, href: string) => {
  const a = document.createElement("a")
  a.href = href
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
}

function MultiView({
  run,
  result,
  onClose,
  expanded,
  onExpandedChange,
}: {
  run: MultiRun
  result: AssetsBatchResult
  onClose: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const { locale, t, f } = useReplayText()
  const reduced = useReducedMotion()
  const playback = usePlayback(STEPS, reduced)
  const { finished } = playback
  const since = useSince(finished, SETTLE, reduced)
  const capital = run.strategy.initialCapital
  const scrollRef = useRef<HTMLDivElement>(null)
  const [openSymbol, setOpenSymbol] = useState<string | null>(null)

  const timeline = useMemo(() => timelineOf(run.from, run.to), [run.from, run.to])
  const tiles = useMemo(() => buildTiles(result, timeline, capital), [result, timeline, capital])
  const domain = useMemo(() => returnDomain(tiles, capital), [tiles, capital])
  const summary = useMemo(() => batchSummary(result, run.from), [result, run.from])
  const rows = useMemo(() => batchRows(result), [result])
  // Place by final return, shown on the tiles once the replay ends.
  const places = useMemo(() => {
    const order = tiles.filter((tile) => tile.finalReturn !== null).sort((a, b) => (b.finalReturn ?? 0) - (a.finalReturn ?? 0))
    return new Map(order.map((tile, i) => [tile.symbol, i + 1]))
  }, [tiles])

  // The report of one asset opens from the result already in memory: nothing is run or charged.
  const opened = openSymbol ? result.items.find((item) => item.symbol === openSymbol) : undefined
  const reportRun = useMemo<ReplayRun | null>(
    () => (openSymbol ? { symbol: openSymbol, timeframe: run.timeframe, from: run.from, to: run.to, strategy: run.strategy, mode: "batch" } : null),
    [openSymbol, run.timeframe, run.from, run.to, run.strategy]
  )

  const restart = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    playback.restart()
  }, [playback])

  // Keyboard: space play/pause, ←/→ move, 1/2/4 speed, End/S summary, R replay.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || openSymbol !== null) return
      const onControl = e.target instanceof HTMLElement && e.target.closest("button, [role=slider], summary, a, tr[tabindex], [role=button]")
      if (finished) {
        if (e.key === "r" || e.key === "R") restart()
        else return
        e.preventDefault()
        return
      }
      if (e.key === " " && !onControl) playback.toggle()
      else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !onControl) playback.seek(playback.pos + (e.key === "ArrowRight" ? 1 : -1) * STEPS * 0.02)
      else if (SPEEDS.includes(Number(e.key) as Speed)) playback.setSpeed(Number(e.key) as Speed)
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

  const saveCsv = () => {
    const headers =
      locale === "es"
        ? ["Activo", "Estrategia %", "Mantener %", "Diferencia pts", "Caída máx. %", "Acierto %", "Sharpe", "Órdenes", "Capital final", "Factor de beneficio", "Exposición %", "Primera vela"]
        : ["Asset", "Strategy %", "Hold %", "Difference pts", "Max drawdown %", "Win rate %", "Sharpe", "Orders", "Final capital", "Profit factor", "Exposure %", "First candle"]
    const url = URL.createObjectURL(new Blob([batchCsv(rows, locale, headers)], { type: "text/csv;charset=utf-8" }))
    download(`backtestlab-${run.symbols.length}-assets-${run.timeframe}-${run.from}_${run.to}.csv`, url)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const n = tiles.length
  const columns = n <= 4 ? "sm:grid-cols-2" : n <= 6 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
  const status = finished
    ? { variant: "up" as const, icon: <CheckCircle2Icon />, text: t("Completado", "Done") }
    : playback.playing
      ? { variant: "primary" as const, icon: <LoaderCircleIcon className="animate-spin" />, text: t("Reproduciendo", "Replaying") }
      : { variant: "default" as const, icon: <PauseIcon />, text: t("En pausa", "Paused") }
  // The results rise in once the animation has finished (final frame at once with reduced motion).
  const rise = easeOutCubic(phase(since, 0.15, 1))
  const progress = playback.pos / STEPS

  return (
    <>
      <MultiHeader run={run} expanded={expanded} onExpandedChange={onExpandedChange}>
        <Badge variant={status.variant} className="hidden sm:inline-flex">
          {status.icon}
          {status.text}
        </Badge>
      </MultiHeader>

      <div ref={scrollRef} data-report-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 bg-card p-3 sm:p-4 md:p-5">
          <section
            aria-label={t("Reproducción de los backtests", "Backtests replay")}
            className="grid rounded-xl border bg-card shadow-xl shadow-primary/5 ring-1 ring-foreground/[0.03] lg:grid-cols-[minmax(0,1fr)_20rem]"
          >
            <div className={`grid content-start gap-3 p-3 ${columns}`}>
              {tiles.map((tile) => (
                <AssetTile
                  key={tile.symbol}
                  tile={tile}
                  timeline={timeline}
                  capital={capital}
                  pos={playback.pos}
                  finished={finished}
                  place={finished ? (places.get(tile.symbol) ?? null) : null}
                  onOpen={setOpenSymbol}
                />
              ))}
            </div>
            <aside className="border-t lg:border-t-0 lg:border-l">
              <RankingPanel tiles={tiles} timeline={timeline} capital={capital} pos={playback.pos} domain={domain} />
              <LiveSummary tiles={tiles} timeline={timeline} capital={capital} pos={playback.pos} />
            </aside>
            <p className="sr-only" aria-live="polite">
              {finished ? t("Reproducción completada", "Replay finished") : ""}
            </p>
          </section>

          {finished && (
            <div className="flex flex-col gap-4" style={{ opacity: rise, transform: `translateY(${(1 - rise) * 12}px)` }}>
              <BatchVerdict summary={summary} strategyName={run.strategy.name} />
              <BatchReading summary={summary} />
              <div className="grid gap-4 xl:grid-cols-2">
                <StrategyVsHold rows={rows} onOpen={setOpenSymbol} />
                <RiskReturn rows={rows} onOpen={setOpenSymbol} />
              </div>
              <CurvesOverlay tiles={tiles} timeline={timeline} />
              <BatchTable result={result} from={run.from} onOpen={setOpenSymbol} />
              <p className="num text-caption text-muted-foreground">
                {t(
                  `Cada activo se ha simulado por separado con el capital inicial completo (${f.usdt(capital)}) y comisión de ${f.amount.format(run.strategy.feePct)} % por orden; no es una cartera con el capital compartido. Resultados sobre datos históricos: no garantizan resultados futuros.`,
                  `Each asset was simulated on its own with the full initial capital (${f.usdt(capital)}) and a ${f.amount.format(run.strategy.feePct)}% fee per order; it isn't a portfolio sharing capital. Results on historical data: they don't guarantee future results.`
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t px-3 py-3 sm:px-4 md:px-5">
        {finished ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={restart}>
              <RotateCcwIcon data-icon="inline-start" />
              {t("Repetir animación", "Replay animation")}
            </Button>
            <Button variant="outline" onClick={saveCsv}>
              <DownloadIcon data-icon="inline-start" />
              CSV
            </Button>
            <Button onClick={onClose}>{t("Cerrar", "Close")}</Button>
          </div>
        ) : (
          <TimelineBar
            playback={playback}
            steps={STEPS}
            date={f.date.format(new Date(timeAt(timeline, playback.pos)))}
            counter={t(`${summary.ran} activos · ${Math.round(progress * 100)} %`, `${summary.ran} assets · ${Math.round(progress * 100)}%`)}
          />
        )}
      </footer>

      <Dialog open={reportRun !== null && opened?.result != null} onOpenChange={(open) => !open && setOpenSymbol(null)}>
        <DialogContent className={REPLAY_DIALOG_CLASS}>
          {reportRun && opened?.result && <ReplayPlayer key={reportRun.symbol} run={reportRun} preloaded={opened.result} onClose={() => setOpenSymbol(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
