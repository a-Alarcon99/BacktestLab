"use client"

import { useMemo } from "react"
import { PlayIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useAssetView } from "@/components/market/asset-view"
import { maxBacktestCandles } from "@/lib/candles"
import { formatDate, numberFormat } from "@/lib/format"
import { REPLAY_DIALOG_CLASS, ReplayPlayer, type ReplayRun } from "./backtest-replay"
import { BacktestSetupFields, NotRunnable, useBacktestSetup } from "./backtest-setup"

/**
 * Backtest parameters: date range (presets + explicit from/to) and timeframe first, because
 * they define the dataset; then one of the user's strategies (which carries the capital). The
 * timeframe is independent from the price chart's. "Ejecutar backtest" opens the replay pop-up.
 */
function BacktestConfigCard({
  symbol,
  historySince,
  today,
  open: replayOpen,
  onOpenChange: setReplayOpen,
}: {
  symbol: string
  historySince: string
  /** Current UTC date (YYYY-MM-DD): upper bound and default end of the range. */
  today: string
  /** The replay pop-up. */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setup = useBacktestSetup({ today, historySince })
  const { strategies, strategy, timeframe, from, to, valid, candles, rangeOk } = setup
  const { locale, t } = useI18n()
  const candleCount = numberFormat(locale, { useGrouping: "always" })

  // Stable while the inputs don't change: a new object would start a new run.
  const run = useMemo<ReplayRun | null>(
    () => (rangeOk && strategy ? { symbol, strategy, timeframe, from, to, mode: "new" } : null),
    [rangeOk, symbol, strategy, timeframe, from, to]
  )

  return (
    <Card id="backtest" className="scroll-mt-[calc(var(--spacing-header)+1rem)]">
      <CardHeader>
        <CardTitle>{t("Configurar backtest", "Set up backtest")}</CardTitle>
        <Badge>{t("Borrador", "Draft")}</Badge>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <BacktestSetupFields setup={setup} />
      </CardContent>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <p className="num text-caption text-muted-foreground">
          {valid ? (
            <>
              <span className="font-semibold text-foreground">{symbol}/USDT</span> · {formatDate(from, locale)} →{" "}
              {formatDate(to, locale)} · {timeframe} · ≈ {candleCount.format(candles)} {t("velas", "candles")}
            </>
          ) : (
            t("Revisa el rango de fechas.", "Check the date range.")
          )}
          {valid && candles > maxBacktestCandles && (
            <span className="block text-destructive">
              {t(
                `Máximo ${candleCount.format(maxBacktestCandles)} velas por backtest: acorta el rango o usa una temporalidad mayor.`,
                `At most ${candleCount.format(maxBacktestCandles)} candles per backtest: shorten the range or use a longer timeframe.`
              )}
            </span>
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
          {t("Ejecutar backtest", "Run backtest")}
        </Button>
      </footer>

      <Dialog open={replayOpen} onOpenChange={setReplayOpen}>
        <DialogContent className={run ? REPLAY_DIALOG_CLASS : "w-[min(32rem,calc(100vw-1.5rem))]"}>
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

/** The card of the asset page, whose pop-up state is shared with the mobile action bar. */
function BacktestConfig(props: { symbol: string; historySince: string; today: string }) {
  const { replayOpen, setReplayOpen } = useAssetView()
  return <BacktestConfigCard {...props} open={replayOpen} onOpenChange={setReplayOpen} />
}

export { BacktestConfig, BacktestConfigCard }
