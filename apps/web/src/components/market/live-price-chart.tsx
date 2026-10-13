"use client"

import { useEffect, useState } from "react"
import { ChartCandlestickIcon, ChartLineIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { fetchCandles, timeframes, type Candle, type Timeframe } from "@/lib/candles"
import { chartTypes, useAssetView } from "./asset-view"
import { PriceChart } from "./price-chart"

const chartTypeLabels = {
  line: (
    <>
      <ChartLineIcon />
      Línea
    </>
  ),
  candles: (
    <>
      <ChartCandlestickIcon />
      Velas
    </>
  ),
}

/** Timeframe and line/candles toggle for the price chart card header. */
function PriceChartControls() {
  const { timeframe, setTimeframe, chartType, setChartType } = useAssetView()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label="Temporalidad del gráfico"
        options={timeframes}
        value={timeframe}
        onValueChange={setTimeframe}
        size="sm"
      />
      <SegmentedControl
        label="Tipo de gráfico"
        options={chartTypes}
        value={chartType}
        onValueChange={setChartType}
        labels={chartTypeLabels}
        size="sm"
      />
    </div>
  )
}

/**
 * Price chart for the selected timeframe. The initial series is rendered on the server; other
 * timeframes are fetched from the API on first use and kept for the rest of the visit.
 */
function LivePriceChart({
  symbol,
  initialTimeframe,
  initialCandles,
}: {
  symbol: string
  initialTimeframe: Timeframe
  initialCandles: Candle[]
}) {
  const { timeframe, chartType } = useAssetView()
  const [series, setSeries] = useState<Partial<Record<Timeframe, Candle[] | "error">>>({
    [initialTimeframe]: initialCandles,
  })
  const candles = series[timeframe]

  useEffect(() => {
    if (candles) return
    fetchCandles(symbol, timeframe).then(
      (data) => setSeries((s) => ({ ...s, [timeframe]: data })),
      () => setSeries((s) => ({ ...s, [timeframe]: "error" }))
    )
  }, [symbol, timeframe, candles])

  if (!candles) return <ChartSkeleton />
  if (candles === "error") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center md:h-80">
        <p className="text-caption text-muted-foreground">No se pudieron cargar las velas de {timeframe}.</p>
        <Button size="sm" variant="outline" onClick={() => setSeries((s) => ({ ...s, [timeframe]: undefined }))}>
          Reintentar
        </Button>
      </div>
    )
  }
  if (candles.length < 2) {
    return <p className="py-10 text-center text-caption text-muted-foreground">Sin datos de precio para este periodo.</p>
  }
  return <PriceChart id={symbol} candles={candles} type={chartType} />
}

function ChartSkeleton() {
  return <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted/40 md:h-80" />
}

export { ChartSkeleton, LivePriceChart, PriceChartControls }
