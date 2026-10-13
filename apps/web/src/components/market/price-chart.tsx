"use client"

import { useEffect, useRef, useState } from "react"
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts"
import { cn } from "cn"
import { formatPrice } from "@/lib/format"
import type { Candle } from "@/lib/candles"

/** Candles shown on first render; the rest of the loaded history is reachable by dragging. */
const INITIAL_VISIBLE = 100
/** `onReachStart` fires when fewer than this many loaded candles are left to the left of the view. */
const LOAD_OLDER_THRESHOLD = 30

const axisNumber = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })
const axisSmallNumber = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 })
const volumeNumber = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 2 })

const toTime = (c: Candle) => (Date.parse(c.time) / 1000) as UTCTimestamp

/** The chart canvas can't parse `oklch()` / `var()`: resolve a CSS token to an rgba() string. */
function readColor(token: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r},${g},${b},${a / 255})`
}

function readColors() {
  return {
    text: readColor("--muted-foreground"),
    grid: readColor("--border"),
    crosshair: readColor("--border-strong"),
    up: readColor("--up"),
    down: readColor("--down"),
  }
}

function chartOptions(colors: ReturnType<typeof readColors>) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: colors.text,
      attributionLogo: false,
    },
    grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: {
      vertLine: { color: colors.crosshair, labelBackgroundColor: colors.text },
      horzLine: { color: colors.crosshair, labelBackgroundColor: colors.text },
    },
  }
}

/**
 * Interactive price chart (lightweight-charts): hover a candle to read its OHLCV, drag to pan
 * through the loaded history, mouse wheel / pinch to zoom, double click on the axes to reset.
 * - `line`: close line in the trend color with a soft gradient fill.
 * - `candles`: OHLC candlesticks, each colored by its own direction (close vs. open).
 *
 * `candles` may grow at the start (older history prepended): the viewport then stays on the same
 * candles. `onReachStart` asks the parent for that older page when the view nears the first candle.
 */
function PriceChart({
  candles,
  type = "line",
  intraday = false,
  onReachStart,
  className,
}: {
  /** Oldest first. */
  candles: Candle[]
  type?: "line" | "candles"
  /** Show the hour in the candle tooltip (timeframes below 1 day). */
  intraday?: boolean
  /** Called (repeatedly) while the view is near the oldest loaded candle. */
  onReachStart?: () => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null)
  const byTime = useRef(new Map<number, Candle>())
  const loaded = useRef<{ first: number; last: number } | null>(null)
  const onReachStartRef = useRef(onReachStart)
  const [hovered, setHovered] = useState<Candle | null>(null)
  const [themeVersion, setThemeVersion] = useState(0)

  // Line color follows the trend of the latest window, so prepending history doesn't flip it.
  const n = candles.length
  const trendUp = n === 0 || candles[n - 1].close >= candles[Math.max(0, n - INITIAL_VISIBLE)].close

  useEffect(() => {
    onReachStartRef.current = onReachStart
  })

  // Chart instance + theme change observer.
  useEffect(() => {
    const chart = createChart(containerRef.current!, { autoSize: true, ...chartOptions(readColors()) })
    chartRef.current = chart

    const onMove = (param: MouseEventParams) => {
      setHovered(param.point && param.time ? (byTime.current.get(param.time as number) ?? null) : null)
    }
    chart.subscribeCrosshairMove(onMove)

    const onRange = (range: LogicalRange | null) => {
      if (range && range.from < LOAD_OLDER_THRESHOLD) onReachStartRef.current?.()
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)

    const observer = new MutationObserver(() => setThemeVersion((v) => v + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    return () => {
      observer.disconnect()
      chart.unsubscribeCrosshairMove(onMove)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // Series for the selected type and theme.
  useEffect(() => {
    const chart = chartRef.current!
    const colors = readColors()
    chart.applyOptions(chartOptions(colors))

    let series: ISeriesApi<"Candlestick"> | ISeriesApi<"Area">
    if (type === "candles") {
      series = chart.addSeries(CandlestickSeries, {
        upColor: colors.up,
        downColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
        borderVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      })
    } else {
      const trend = trendUp ? colors.up : colors.down
      series = chart.addSeries(AreaSeries, {
        lineColor: trend,
        topColor: trend.replace(/,[\d.]+\)$/, ",0.16)"),
        bottomColor: trend.replace(/,[\d.]+\)$/, ",0)"),
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      })
    }
    series.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })
    chart.applyOptions({
      localization: {
        priceFormatter: (p: number) => (p < 1 ? axisSmallNumber : axisNumber).format(p),
      },
    })
    seriesRef.current = series

    // On unmount (and Strict Mode's double effect) the chart effect's cleanup runs first and
    // already disposed the chart together with its series.
    return () => {
      seriesRef.current = null
      if (chartRef.current) chart.removeSeries(series)
    }
  }, [type, themeVersion, trendUp])

  // Data and viewport. Declared after the series effect so it always finds the series.
  useEffect(() => {
    const chart = chartRef.current!
    const series = seriesRef.current!
    const timeScale = chart.timeScale()
    byTime.current = new Map(candles.map((c) => [toTime(c), c]))

    const previous = loaded.current
    const range = timeScale.getVisibleLogicalRange()
    if (type === "candles") {
      ;(series as ISeriesApi<"Candlestick">).setData(
        candles.map((c) => ({ time: toTime(c), open: c.open, high: c.high, low: c.low, close: c.close }))
      )
    } else {
      ;(series as ISeriesApi<"Area">).setData(candles.map((c) => ({ time: toTime(c), value: c.close })))
    }

    const first = toTime(candles[0])
    const last = toTime(candles[candles.length - 1])
    const prepended =
      previous && previous.last === last && first < previous.first
        ? candles.findIndex((c) => toTime(c) === previous.first)
        : -1
    if (previous && previous.first === first && previous.last === last) {
      // Same candles on a new series (chart type or theme change): keep the viewport.
    } else if (prepended > 0 && range) {
      // Older candles were added to the left: keep looking at the same candles.
      timeScale.setVisibleLogicalRange({ from: range.from + prepended, to: range.to + prepended })
    } else if (candles.length > INITIAL_VISIBLE) {
      // Initial viewport: latest candles; older ones are one drag away.
      timeScale.setVisibleLogicalRange({ from: candles.length - INITIAL_VISIBLE, to: candles.length + 2 })
    } else {
      timeScale.fitContent()
    }
    loaded.current = { first, last }
  }, [candles, type, themeVersion, trendUp])

  return (
    <div className={cn("relative h-64 md:h-80", className)}>
      <div ref={containerRef} className="size-full" role="img" aria-label="Gráfico de precio interactivo" />
      {hovered && <CandleInfo candle={hovered} intraday={intraday} />}
    </div>
  )
}

/** Legend pinned to the top-left corner with the hovered candle's data. */
function CandleInfo({ candle, intraday }: { candle: Candle; intraday: boolean }) {
  const change = ((candle.close - candle.open) / candle.open) * 100
  const date = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(intraday ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(new Date(candle.time))
  return (
    <div className="num pointer-events-none absolute top-1 left-1 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-card/90 px-2 py-1 text-caption">
      <span className="font-semibold text-foreground">
        {date}
        {intraday && " UTC"}
      </span>
      <Value label="A" value={candle.open} />
      <Value label="Máx" value={candle.high} />
      <Value label="Mín" value={candle.low} />
      <Value label="C" value={candle.close} />
      <span className={change >= 0 ? "text-up" : "text-down"}>
        {change >= 0 ? "+" : ""}
        {change.toFixed(2).replace(".", ",")}%
      </span>
      <span className="text-muted-foreground">Vol {volumeNumber.format(candle.volume)}</span>
    </div>
  )
}

function Value({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-muted-foreground">
      {label} <span className="text-foreground">{formatPrice(value)}</span>
    </span>
  )
}

export { PriceChart }
