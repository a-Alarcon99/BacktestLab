"use client"

import { useEffect, useState } from "react"
import { AlertTriangleIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react"
import { LimitCta } from "@/components/plan/plan-usage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { describeBacktestError, recordFromRobust, runBatch, type RobustResult } from "@/lib/backtests"
import { addBacktest } from "@/lib/storage/backtests"
import { LoadingArt, REPLAY_DIALOG_CLASS } from "../backtest-replay"
import { useReplayText } from "../replay/format"
import { RobustHeader, type RobustRun } from "./robust-frame"
import { SensitivityView } from "./sensitivity-view"
import { TimeframesView } from "./timeframes-view"
import { WindowsView } from "./windows-view"

export type { RobustRun }

type RunState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; result: RobustResult }

/** Dialog around the player, for the history rows. */
export function RobustReplayDialog({ open, onOpenChange, run }: { open: boolean; onOpenChange: (open: boolean) => void; run: RobustRun }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={REPLAY_DIALOG_CLASS}>
        <RobustReplayPlayer run={run} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Runs a robustness test (rolling windows, parameter sensitivity or neighbouring timeframes) and
 * animates it. `run` must be referentially stable (kept in state or memoized): a new object
 * starts a new run.
 */
export function RobustReplayPlayer({ run, onClose }: { run: RobustRun; onClose: () => void }) {
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
        if (mode === "new") addBacktest(recordFromRobust(request, result)).catch(() => {})
      },
      (error) => {
        if (!controller.signal.aborted) setState({ status: "error", message: describeBacktestError(error, locale) })
      }
    )
    return () => controller.abort()
  }, [run, attempt, locale])

  if (state.status === "ready") {
    const { result } = state
    const shared = { onClose, expanded, onExpandedChange: setExpanded }
    if (run.kind === "windows" && result.kind === "windows") return <WindowsView run={run} result={result} {...shared} />
    if (run.kind === "sensitivity" && result.kind === "sensitivity") return <SensitivityView run={run} result={result} {...shared} />
    if (run.kind === "timeframes" && result.kind === "timeframes") return <TimeframesView run={run} result={result} {...shared} />
  }
  const failed = state.status === "error"
  return (
    <>
      <RobustHeader run={run} expanded={expanded} onExpandedChange={setExpanded}>
        {failed ? (
          <Badge variant="down" className="hidden sm:inline-flex">
            <AlertTriangleIcon />
            Error
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
            <p className="font-semibold">{t("No se pudo ejecutar la prueba", "The test couldn't run")}</p>
            <p className="max-w-md text-caption text-muted-foreground">{state.message}</p>
            <LimitCta />
          </>
        ) : (
          <>
            <LoadingArt />
            <p className="font-semibold">{t("Calculando las simulaciones", "Calculating the simulations")}</p>
            <p className="max-w-sm text-caption text-muted-foreground">
              {t(
                "Cada una se simula por separado con el capital completo, vela a vela. Con muchas variantes o rangos largos puede tardar unos segundos.",
                "Each one is simulated on its own with the full capital, candle by candle. With many variants or long ranges it may take a few seconds."
              )}
            </p>
          </>
        )}
      </div>
      <footer className="flex justify-end gap-2 border-t px-4 py-3 md:px-5">
        <Button variant="outline" onClick={onClose}>
          {t("Cerrar", "Close")}
        </Button>
        {failed && (
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
