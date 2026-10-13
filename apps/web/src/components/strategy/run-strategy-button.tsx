"use client"

import { useState } from "react"
import { FlaskConicalIcon, PlayIcon } from "lucide-react"
import { ReplayPlayer, type ReplayRun } from "@/components/backtest/backtest-replay"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
  defaultTimeframe,
  estimateCandles,
  presetFrom,
  rangePresets,
  timeframes,
  type RangePreset,
  type Timeframe,
} from "@/lib/candles"
import { formatDate } from "@/lib/format"
import type { Strategy } from "@/lib/strategy"

export type RunnableAsset = { symbol: string; name: string; historySince: string }

const candleCount = new Intl.NumberFormat("es-ES", { useGrouping: "always" })

/**
 * "Ejecutar backtest" button of a strategy card. Opens a pop-up in two steps:
 * 1) choose asset, period and candle timeframe; 2) the backtest replay animation.
 */
function RunStrategyButton({
  strategy,
  assets,
  today,
}: {
  strategy: Strategy
  assets: RunnableAsset[]
  today: string
}) {
  const [open, setOpen] = useState(false)
  const [run, setRun] = useState<ReplayRun | null>(null)

  const [symbol, setSymbol] = useState(assets[0].symbol)
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const [preset, setPreset] = useState<RangePreset>("1A")
  const historySince = assets.find((a) => a.symbol === symbol)!.historySince
  const [from, setFrom] = useState(() => presetFrom("1A", today, assets[0].historySince))
  const [to, setTo] = useState(today)

  const valid = from !== "" && to !== "" && from <= to && from >= historySince && to <= today
  const candles = valid ? estimateCandles(from, to, timeframe) : 0

  const openDialog = () => {
    setRun(null)
    setOpen(true)
  }

  return (
    <>
      <Button size="sm" onClick={openDialog} aria-haspopup="dialog">
        <PlayIcon data-icon="inline-start" />
        Ejecutar backtest
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={run ? undefined : "w-[min(36rem,calc(100vw-1.5rem))]"}>
          {run ? (
            <ReplayPlayer run={run} onClose={() => setOpen(false)} />
          ) : (
            <>
              <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <FlaskConicalIcon className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <DialogTitle className="truncate text-title font-bold">{strategy.name}</DialogTitle>
                  <DialogDescription className="text-caption text-muted-foreground">
                    Elige dónde y cuándo probar la estrategia.
                  </DialogDescription>
                </div>
                <DialogClose />
              </header>

              <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 md:px-5">
                <Field label="Activo" htmlFor="run-asset">
                  <Select
                    id="run-asset"
                    value={symbol}
                    onChange={(event) => {
                      const next = assets.find((a) => a.symbol === event.target.value)!
                      setSymbol(next.symbol)
                      setFrom(presetFrom(preset, today, next.historySince))
                      setTo(today)
                    }}
                  >
                    {assets.map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.name} ({asset.symbol}/USDT)
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Periodo de tiempo">
                  <SegmentedControl
                    label="Rango predefinido"
                    options={rangePresets}
                    value={preset}
                    onValueChange={(next) => {
                      setPreset(next)
                      setFrom(presetFrom(next, today, historySince))
                      setTo(today)
                    }}
                    size="sm"
                    className="self-start"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Desde" htmlFor="run-from">
                      <Input
                        id="run-from"
                        type="date"
                        value={from}
                        min={historySince}
                        max={to || today}
                        onChange={(event) => setFrom(event.target.value)}
                      />
                    </Field>
                    <Field label="Hasta" htmlFor="run-to">
                      <Input
                        id="run-to"
                        type="date"
                        value={to}
                        min={from || historySince}
                        max={today}
                        onChange={(event) => setTo(event.target.value)}
                      />
                    </Field>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    Histórico disponible desde <span className="num font-semibold">{formatDate(historySince)}</span>
                  </p>
                </Field>

                <Field label="Temporalidad de las velas">
                  <SegmentedControl
                    label="Temporalidad"
                    options={timeframes}
                    value={timeframe}
                    onValueChange={setTimeframe}
                    className="w-full"
                  />
                </Field>
              </div>

              <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
                <p className="num text-caption text-muted-foreground">
                  {valid ? (
                    <>
                      <span className="font-semibold text-foreground">{symbol}/USDT</span> · {timeframe} · ≈{" "}
                      {candleCount.format(candles)} velas
                    </>
                  ) : (
                    "Revisa el rango de fechas."
                  )}
                </p>
                <Button
                  size="lg"
                  disabled={!valid || candles < 2}
                  onClick={() => setRun({ symbol, strategy, timeframe, from, to, mode: "new" })}
                >
                  <PlayIcon data-icon="inline-start" />
                  Ejecutar backtest
                </Button>
              </footer>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export { RunStrategyButton }
