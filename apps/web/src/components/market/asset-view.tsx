"use client"

import { createContext, useContext, useState } from "react"
import { defaultTimeframe, type Timeframe } from "@/lib/candles"

export const chartTypes = ["line", "candles"] as const
export type ChartType = (typeof chartTypes)[number]

type AssetView = {
  /** Timeframe of the price chart (independent from the backtest's). */
  timeframe: Timeframe
  setTimeframe: (timeframe: Timeframe) => void
  chartType: ChartType
  setChartType: (chartType: ChartType) => void
  /** Backtest replay pop-up, opened from the config footer or the mobile action bar. */
  replayOpen: boolean
  setReplayOpen: (open: boolean) => void
}

const AssetViewContext = createContext<AssetView | null>(null)

/** Client state of the asset page: selected timeframe, price chart type and replay pop-up. */
function AssetViewProvider({ children }: { children: React.ReactNode }) {
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const [chartType, setChartType] = useState<ChartType>("line")
  const [replayOpen, setReplayOpen] = useState(false)
  return (
    <AssetViewContext value={{ timeframe, setTimeframe, chartType, setChartType, replayOpen, setReplayOpen }}>
      {children}
    </AssetViewContext>
  )
}

function useAssetView() {
  const view = useContext(AssetViewContext)
  if (!view) throw new Error("useAssetView must be used within <AssetViewProvider>")
  return view
}

export { AssetViewProvider, useAssetView }
