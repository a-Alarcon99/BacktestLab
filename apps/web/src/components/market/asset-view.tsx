"use client"

import { createContext, useContext, useState } from "react"
import { defaultTimeframe, type Timeframe } from "@/lib/candles"

export const chartTypes = ["line", "candles"] as const
export type ChartType = (typeof chartTypes)[number]

type AssetView = {
  /** Shared by the backtest config and the price chart. */
  timeframe: Timeframe
  setTimeframe: (timeframe: Timeframe) => void
  chartType: ChartType
  setChartType: (chartType: ChartType) => void
}

const AssetViewContext = createContext<AssetView | null>(null)

/** Client state of the asset page: selected timeframe and price chart type. */
function AssetViewProvider({ children }: { children: React.ReactNode }) {
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe)
  const [chartType, setChartType] = useState<ChartType>("line")
  return (
    <AssetViewContext value={{ timeframe, setTimeframe, chartType, setChartType }}>{children}</AssetViewContext>
  )
}

function useAssetView() {
  const view = useContext(AssetViewContext)
  if (!view) throw new Error("useAssetView must be used within <AssetViewProvider>")
  return view
}

export { AssetViewProvider, useAssetView }
