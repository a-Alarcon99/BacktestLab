"use client"

import { FlaskConicalIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { useRecentBacktests } from "@/lib/storage/backtests"
import { BacktestList } from "./backtest-list"

/** Past runs of one asset, read from this browser. */
function AssetBacktests({ symbol }: { symbol: string }) {
  const { data } = useRecentBacktests()
  const { t } = useI18n()

  if (!data) return <div aria-hidden className="h-40 animate-pulse rounded-xl bg-muted/40" />

  const backtests = data.filter((b) => b.symbol === symbol)
  if (backtests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <FlaskConicalIcon className="size-5" />
        </span>
        <p className="font-semibold">{t("Todavía no hay resultados", "No results yet")}</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          {t(
            "Elige el rango de fechas, la temporalidad y la estrategia, y ejecuta el backtest: aparecerá aquí para que puedas revisarlo.",
            "Choose the date range, the timeframe and the strategy, then run the backtest: it will show up here so you can review it."
          )}
        </p>
      </div>
    )
  }
  return <BacktestList backtests={backtests} />
}

export { AssetBacktests }
