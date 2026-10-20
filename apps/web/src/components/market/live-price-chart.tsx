"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChartCandlestickIcon, ChartLineIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { fetchCandles, isIntraday, timeframes, type Candle, type Timeframe } from "@/lib/candles"
import { chartTypes, useAssetView } from "./asset-view"
import { PriceChart } from "./price-chart"


const OLDER_RETRY_COOLDOWN_MS = 3_000

/** Timeframe and line/candles toggle for the price chart card header. */
function PriceChartControls() {
  const { timeframe, setTimeframe, chartType, setChartType } = useAssetView()
  const { t } = useI18n()
  const chartTypeLabels = {
    line: (
      <>
        <ChartLineIcon />
        {t("Línea", "Line")}
      </>
    ),
    candles: (
      <>
        <ChartCandlestickIcon />
        {t("Velas", "Candles")}
      </>
    ),
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label={t("Temporalidad del gráfico", "Chart timeframe")}
        options={timeframes}
        value={timeframe}
        onValueChange={setTimeframe}
        size="sm"
      />
      <SegmentedControl
        label={t("Tipo de gráfico", "Chart type")}
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
 * timeframes are fetched from the API on first use and kept for the rest of the visit. Without
 * `initialCandles` (the server could not load them) the initial timeframe is fetched the same way.
 */
function LivePriceChart({
  symbol,
  initialTimeframe,
  initialCandles,
}: {
  symbol: string
  initialTimeframe: Timeframe
  initialCandles?: Candle[]
}) {
  const { timeframe, chartType } = useAssetView()
  const { t } = useI18n()
  const [series, setSeries] = useState<Partial<Record<Timeframe, Candle[] | "error">>>(
    initialCandles ? { [initialTimeframe]: initialCandles } : {}
  )
  // Timeframes whose first candle has been loaded; `loadingOlder` avoids overlapping page requests.
  const [atStart, setAtStart] = useState<Partial<Record<Timeframe, true>>>({})
  const loadingOlder = useRef(false)
  // After a failed page, wait before retrying: the chart asks on every pan event near the edge,
  // which would otherwise turn an API error (or a 429) into a burst of requests.
  const retryOlderAt = useRef(0)
  const candles = series[timeframe]

  const loadOlder = useCallback(() => {
    const current = series[timeframe]
    if (!Array.isArray(current) || current.length === 0 || atStart[timeframe] || loadingOlder.current) return
    if (Date.now() < retryOlderAt.current) return
    const requested = timeframe
    loadingOlder.current = true
    fetchCandles(symbol, requested, current[0].time)
      .then((older) => {
        if (older.length === 0) {
          setAtStart((s) => ({ ...s, [requested]: true }))
          return
        }
        setSeries((s) => {
          const loaded = s[requested]
          return Array.isArray(loaded) ? { ...s, [requested]: [...older, ...loaded] } : s
        })
      })
      .catch(() => {
        // Transient: the next drag to the left edge after the cooldown retries.
        retryOlderAt.current = Date.now() + OLDER_RETRY_COOLDOWN_MS
      })
      .finally(() => {
        loadingOlder.current = false
      })
  }, [symbol, timeframe, series, atStart])

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
        <p className="text-caption text-muted-foreground">
          {t(`No se pudieron cargar las velas de ${timeframe}.`, `Couldn't load the ${timeframe} candles.`)}
        </p>
        <Button size="sm" variant="outline" onClick={() => setSeries((s) => ({ ...s, [timeframe]: undefined }))}>
          {t("Reintentar", "Retry")}
        </Button>
      </div>
    )
  }
  if (candles.length < 2) {
    return (
      <p className="py-10 text-center text-caption text-muted-foreground">
        {t("Sin datos de precio para este periodo.", "No price data for this period.")}
      </p>
    )
  }
  return (
    <PriceChart
      candles={candles}
      type={chartType}
      intraday={isIntraday(timeframe)}
      onReachStart={loadOlder}
    />
  )
}

function ChartSkeleton() {
  return <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted/40 md:h-80" />
}

export { ChartSkeleton, LivePriceChart, PriceChartControls }
