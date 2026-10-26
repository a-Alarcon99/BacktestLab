"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangleIcon, DicesIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react"
import { LimitCta } from "@/components/plan/plan-usage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { describeBacktestError, runBacktest, runBatch } from "@/lib/backtests"
import { summarizePaths, type McSummary, type ResampleInput } from "@/lib/monte-carlo"
import { LoadingArt } from "../backtest-replay"
import { useReplayText } from "../replay/format"
import { RobustHeader } from "../robust/robust-frame"
import { McView } from "./mc-view"
import type { McRun } from "./mc-types"
import { useTradesMonteCarlo } from "./use-trades-monte-carlo"

/** Fewer closed trades than this say nothing about luck. */
export const MC_MIN_TRADES = 5

type Stage =
  | { status: "loading"; step: "backtest" | "paths" }
  | { status: "error"; message: string }
  | { status: "few"; trades: number }
  | { status: "trades"; pnls: number[]; initialCapital: number }
  | { status: "paths"; summary: McSummary }

/**
 * Runs a Monte Carlo and animates it. `mc-trades` runs the strategy once through the usual
 * backtest path (one backtest of quota) and mixes its trades in the browser; `mc-paths` asks the
 * engine for synthetic price paths. `run` must be referentially stable: a new object starts a new run.
 */
export function McPlayer({ run, onClose }: { run: McRun; onClose: () => void }) {
  const { locale, t } = useReplayText()
  const [stage, setStage] = useState<Stage>({ status: "loading", step: run.kind === "mc-trades" ? "backtest" : "paths" })
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(true)
  // Another seed mixes the same trades again, which costs nothing.
  const [seed, setSeed] = useState(run.kind === "mc-trades" ? run.seed : 0)

  useEffect(() => {
    const controller = new AbortController()
    const fail = (error: unknown) => {
      if (!controller.signal.aborted) setStage({ status: "error", message: describeBacktestError(error, locale) })
    }
    if (run.kind === "mc-trades") {
      runBacktest({ symbol: run.symbol, timeframe: run.timeframe, from: run.from, to: run.to, strategy: run.strategy }, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        const pnls = result.roundTrips.filter((trip) => !trip.open).map((trip) => trip.pnl)
        setStage(pnls.length < MC_MIN_TRADES ? { status: "few", trades: pnls.length } : { status: "trades", pnls, initialCapital: run.strategy.initialCapital })
      }, fail)
    } else {
      const { symbol, timeframe, from, to, strategy, runs, blockLength, seed: fixed } = run
      runBatch({ kind: "mc-paths", symbol, timeframe, from, to, strategy, paths: runs, ...(blockLength ? { blockLength } : {}), ...(fixed !== undefined ? { seed: fixed } : {}) }, controller.signal).then((result) => {
        if (!controller.signal.aborted) setStage({ status: "paths", summary: summarizePaths(result) })
      }, fail)
    }
    return () => controller.abort()
  }, [run, attempt, locale])

  const input = useMemo<ResampleInput | null>(
    () => (stage.status === "trades" && run.kind === "mc-trades" ? { pnls: stage.pnls, initialCapital: stage.initialCapital, runs: run.runs, method: run.method, seed } : null),
    [stage, run, seed]
  )
  const mixed = useTradesMonteCarlo(input)

  const summary = stage.status === "paths" ? stage.summary : mixed !== undefined && mixed !== "failed" ? mixed : undefined
  if (summary) {
    const reseed =
      run.kind === "mc-trades" ? (
        <Button variant="outline" onClick={() => setSeed((s) => (s + 7919) % 2_147_483_647)}>
          <DicesIcon data-icon="inline-start" />
          {t("Otra semilla", "Another seed")}
        </Button>
      ) : undefined
    return <McView key={`${summary.seed}`} run={run} summary={summary} onClose={onClose} expanded={expanded} onExpandedChange={setExpanded} extraActions={reseed} />
  }

  const failed = stage.status === "error" || stage.status === "few" || mixed === "failed"
  const message =
    stage.status === "error"
      ? stage.message
      : stage.status === "few"
        ? t(
            `Tu estrategia cerró solo ${stage.trades} operaciones en este rango y hacen falta al menos ${MC_MIN_TRADES} (mejor 30 o más). Amplía el rango, usa una temporalidad menor o prueba los mercados sintéticos.`,
            `Your strategy closed only ${stage.trades} trades in this range and at least ${MC_MIN_TRADES} are needed (30 or more is better). Widen the range, use a smaller timeframe or try the synthetic markets.`
          )
        : t("No se pudieron mezclar las operaciones en este navegador.", "The trades couldn't be mixed in this browser.")
  const working = stage.status === "loading" ? stage.step : "mixing"
  return (
    <>
      <RobustHeader run={{ kind: run.kind, symbol: run.symbol, timeframe: run.timeframe, from: run.from, to: run.to, strategy: run.strategy, mode: run.mode, options: t(`${run.runs} simulaciones`, `${run.runs} simulations`) }} expanded={expanded} onExpandedChange={setExpanded}>
        {failed ? (
          <Badge variant="down" className="hidden sm:inline-flex">
            <AlertTriangleIcon />
            {stage.status === "few" ? t("Pocas operaciones", "Few trades") : "Error"}
          </Badge>
        ) : (
          <Badge variant="primary" className="hidden sm:inline-flex">
            <LoaderCircleIcon className="animate-spin" />
            {t("Calculando…", "Calculating…")}
          </Badge>
        )}
      </RobustHeader>
      <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center md:min-h-96">
        {failed ? (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-down-soft text-down">
              <AlertTriangleIcon className="size-5" />
            </span>
            <p className="font-semibold">{stage.status === "few" ? t("Muy pocas operaciones para Monte Carlo", "Too few trades for Monte Carlo") : t("No se pudo ejecutar Monte Carlo", "Monte Carlo couldn't run")}</p>
            <p className="max-w-md text-caption text-muted-foreground">{message}</p>
            {stage.status === "error" && <LimitCta />}
          </>
        ) : (
          <>
            <LoadingArt />
            <p className="font-semibold">
              {working === "backtest"
                ? t("Ejecutando tu estrategia sobre las velas reales", "Running your strategy on the real candles")
                : working === "paths"
                  ? t("Fabricando mercados y simulando la estrategia en cada uno", "Building markets and simulating the strategy on each")
                  : t("Mezclando tus operaciones en tu navegador", "Mixing your trades in your browser")}
            </p>
            <p className="max-w-sm text-caption text-muted-foreground">
              {working === "backtest"
                ? t("Primero hace falta la historia real: es el único cálculo que usa el servidor.", "First the real history is needed: it is the only calculation that uses the server.")
                : working === "paths"
                  ? t("Cada camino es una simulación completa; con muchos caminos o rangos largos puede tardar unos segundos.", "Each path is a full simulation; with many paths or long ranges it may take a few seconds.")
                  : t("Es un cálculo local: no se envía nada y no gasta más backtests.", "It is a local calculation: nothing is sent and no more backtests are used.")}
            </p>
          </>
        )}
      </div>
      <footer className="flex justify-end gap-2 border-t px-4 py-3 md:px-5">
        <Button variant="outline" onClick={onClose}>
          {t("Cerrar", "Close")}
        </Button>
        {failed && stage.status === "error" && (
          <Button
            onClick={() => {
              setStage({ status: "loading", step: run.kind === "mc-trades" ? "backtest" : "paths" })
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
