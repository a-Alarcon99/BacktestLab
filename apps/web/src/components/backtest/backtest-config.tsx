"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FlaskConicalIcon, PlayIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { useAssetView } from "@/components/market/asset-view"
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
import { useStrategies } from "@/lib/storage/strategies"
import { ReplayPlayer, type ReplayRun } from "./backtest-replay"

const DEFAULT_PRESET: RangePreset = "3A"

// es-ES skips grouping for 4-digit numbers by default ("6570"); force "6.570".
const candleCount = new Intl.NumberFormat("es-ES", { useGrouping: "always" })
const capitalFormat = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })

/**
 * Backtest parameters: date range (presets + explicit from/to) and timeframe first, because
 * they define the dataset; then one of the user's strategies (which carries the capital). The
 * timeframe is independent from the price chart's. "Ejecutar backtest" opens the replay pop-up.
 */
function BacktestConfig({
  symbol,
  historySince,
  today,
}: {
  symbol: string
  historySince: string
  /** Current UTC date (YYYY-MM-DD): upper bound and default end of the range. */
  today: string
}) {
  const { data: strategies } = useStrategies()
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const [preset, setPreset] = useState<RangePreset | null>(DEFAULT_PRESET)
  const [from, setFrom] = useState(() => presetFrom(DEFAULT_PRESET, today, historySince))
  const [to, setTo] = useState(today)
  const [strategyId, setStrategyId] = useState<string | null>(null)
  const { replayOpen, setReplayOpen } = useAssetView()

  // Defaults to the most recently updated strategy until the user picks one.
  const strategy = strategies?.find((s) => s.id === strategyId) ?? strategies?.[0]
  const valid = from !== "" && to !== "" && from <= to && from >= historySince && to <= today
  const candles = valid ? estimateCandles(from, to, timeframe) : 0
  const rangeOk = valid && candles >= 2

  // Stable while the inputs don't change: a new object would start a new run.
  const run = useMemo<ReplayRun | null>(
    () => (rangeOk && strategy ? { symbol, strategy, timeframe, from, to, mode: "new" } : null),
    [rangeOk, symbol, strategy, timeframe, from, to]
  )

  return (
    <Card id="backtest" className="scroll-mt-[calc(var(--spacing-header)+1rem)]">
      <CardHeader>
        <CardTitle>Configurar backtest</CardTitle>
        <Badge>Borrador</Badge>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <Field label="Rango de fechas" className="lg:col-span-2">
          <SegmentedControl
            label="Rango predefinido"
            options={rangePresets}
            value={preset ?? ("" as RangePreset)}
            onValueChange={(next) => {
              setPreset(next)
              setFrom(presetFrom(next, today, historySince))
              setTo(today)
            }}
            size="sm"
            className="self-start"
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <DateInput
              id="from"
              label="Desde"
              value={from}
              min={historySince}
              max={to || today}
              onChange={(event) => {
                setPreset(null)
                setFrom(event.target.value)
              }}
            />
            <span aria-hidden className="hidden text-muted-foreground sm:block">→</span>
            <DateInput
              id="to"
              label="Hasta"
              value={to}
              min={from || historySince}
              max={today}
              onChange={(event) => {
                setPreset(null)
                setTo(event.target.value)
              }}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            Histórico disponible desde <span className="num font-semibold">{formatDate(historySince)}</span>
          </p>
        </Field>

        <Field label="Temporalidad" className="lg:col-span-2">
          <SegmentedControl
            label="Temporalidad"
            options={timeframes}
            value={timeframe}
            onValueChange={setTimeframe}
            className="w-full"
          />
        </Field>

        <Field
          label="Estrategia"
          htmlFor="strategy"
          className="lg:col-span-2"
          hint={
            strategy && (
              <>
                Capital inicial <span className="num font-semibold">{capitalFormat.format(strategy.initialCapital)} USDT</span>{" "}
                · comisión <span className="num font-semibold">{capitalFormat.format(strategy.feePct)} %</span> ·{" "}
                <Link href={`/strategies/${strategy.id}/edit`} className="text-primary hover:underline">
                  Editar estrategia
                </Link>
              </>
            )
          }
        >
          {strategies === undefined ? (
            <div aria-hidden className="h-10 animate-pulse rounded-lg bg-muted/40" />
          ) : strategies.length === 0 ? (
            <NoStrategies />
          ) : (
            <Select
              id="strategy"
              name="strategy"
              value={strategy?.id}
              onChange={(event) => setStrategyId(event.target.value)}
            >
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </CardContent>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <p className="num text-caption text-muted-foreground">
          {valid ? (
            <>
              <span className="font-semibold text-foreground">{symbol}/USDT</span> · {formatDate(from)} → {formatDate(to)} ·{" "}
              {timeframe} · ≈ {candleCount.format(candles)} velas
            </>
          ) : (
            "Revisa el rango de fechas."
          )}
        </p>
        <Button
          size="lg"
          type="button"
          className="hidden lg:inline-flex"
          disabled={!run}
          onClick={() => setReplayOpen(true)}
        >
          <PlayIcon data-icon="inline-start" />
          Ejecutar backtest
        </Button>
      </footer>

      <Dialog open={replayOpen} onOpenChange={setReplayOpen}>
        <DialogContent className={run ? undefined : "w-[min(32rem,calc(100vw-1.5rem))]"}>
          {run ? (
            <ReplayPlayer run={run} onClose={() => setReplayOpen(false)} />
          ) : (
            <NotRunnable reason={strategies?.length === 0 ? "no-strategy" : "range"} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function NoStrategies() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-caption text-muted-foreground">
        Todavía no tienes estrategias. Crea una con sus reglas de compra y venta para poder ejecutar el backtest.
      </p>
      <Link href="/strategies/new" className={buttonVariants({ size: "sm", className: "shrink-0" })}>
        Crea tu primera estrategia
      </Link>
    </div>
  )
}

/** Shown by the mobile action bar when the config can't run yet. */
function NotRunnable({ reason }: { reason: "no-strategy" | "range" }) {
  return (
    <>
      <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <FlaskConicalIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <DialogTitle className="text-title font-bold">
            {reason === "no-strategy" ? "Necesitas una estrategia" : "Revisa la configuración"}
          </DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">
            {reason === "no-strategy"
              ? "Crea una estrategia para poder ejecutar el backtest."
              : "El rango de fechas no es válido o es demasiado corto para la temporalidad elegida."}
          </DialogDescription>
        </div>
        <DialogClose />
      </header>
      {reason === "no-strategy" && (
        <footer className="flex justify-end px-4 py-3 md:px-5">
          <Link href="/strategies/new" className={buttonVariants()}>
            Crear estrategia
          </Link>
        </footer>
      )}
    </>
  )
}

function DateInput({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-caption font-semibold text-muted-foreground">
        {label}
      </span>
      <Input id={id} name={id} type="date" className="pl-16 [&::-webkit-calendar-picker-indicator]:opacity-60" {...props} />
    </div>
  )
}

export { BacktestConfig }
