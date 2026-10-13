"use client"

import { useState } from "react"
import { PlayIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Input, Select } from "@/components/ui/input"
import { useAssetView } from "@/components/market/asset-view"
import { BacktestReplayDialog } from "./backtest-replay"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { defaultTimeframe, estimateCandles, timeframes, type Timeframe } from "@/lib/candles"
import { formatDate } from "@/lib/format"

const strategies = [
  { value: "sma-cross", label: "Cruce de medias (SMA 20/50)" },
  { value: "rsi", label: "RSI reversión a la media" },
  { value: "breakout", label: "Ruptura de rango (Donchian)" },
]
const rangePresets = ["1M", "3M", "6M", "1A", "3A", "Máx."] as const

// es-ES skips grouping for 4-digit numbers by default ("6570"); force "6.570".
const candleCount = new Intl.NumberFormat("es-ES", { useGrouping: "always" })

/** Default range: the "3A" preset (3 years back from `today`), clamped to the available history. */
function defaultFrom(today: string, historySince: string) {
  const d = new Date(today)
  d.setUTCFullYear(d.getUTCFullYear() - 3)
  const threeYearsAgo = d.toISOString().slice(0, 10)
  return threeYearsAgo > historySince ? threeYearsAgo : historySince
}

/**
 * Backtest parameters: date range (presets + explicit from/to) and timeframe first,
 * because they define the dataset; strategy and capital after. Nothing is submitted yet; the
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
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const [strategy, setStrategy] = useState(strategies[0].label)
  const { replayOpen, setReplayOpen } = useAssetView()
  const from = defaultFrom(today, historySince)
  const to = today
  const candles = estimateCandles(from, to, timeframe)

  return (
    <Card id="backtest" className="scroll-mt-[calc(var(--spacing-header)+1rem)]">
      <CardHeader>
        <CardTitle>Configurar backtest</CardTitle>
        <Badge>Borrador</Badge>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <Field label="Rango de fechas" className="lg:col-span-2">
          <SegmentedControl label="Rango predefinido" options={rangePresets} value="3A" size="sm" className="self-start" />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <DateInput id="from" label="Desde" defaultValue={from} min={historySince} max={to} />
            <span aria-hidden className="hidden text-muted-foreground sm:block">→</span>
            <DateInput id="to" label="Hasta" defaultValue={to} min={historySince} max={to} />
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

        <Field label="Estrategia" htmlFor="strategy">
          <Select
            id="strategy"
            name="strategy"
            value={strategy}
            onChange={(event) => setStrategy(event.target.value)}
          >
            {strategies.map((s) => (
              <option key={s.value} value={s.label}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Capital inicial" htmlFor="capital">
          <div className="relative">
            <Input id="capital" name="capital" type="number" defaultValue={10000} min={0} className="pr-16" />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-caption font-semibold text-muted-foreground">
              USDT
            </span>
          </div>
        </Field>
      </CardContent>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <p className="num text-caption text-muted-foreground">
          <span className="font-semibold text-foreground">{symbol}/USDT</span> · {formatDate(from)} → {formatDate(to)} ·{" "}
          {timeframe} · ≈ {candleCount.format(candles)} velas
        </p>
        <Button size="lg" type="button" className="hidden lg:inline-flex" onClick={() => setReplayOpen(true)}>
          <PlayIcon data-icon="inline-start" />
          Ejecutar backtest
        </Button>
      </footer>

      <BacktestReplayDialog
        open={replayOpen}
        onOpenChange={setReplayOpen}
        run={{ symbol, strategy, timeframe, from, to, mode: "new" }}
      />
    </Card>
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
