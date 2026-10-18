"use client"

import { PlayIcon } from "lucide-react"
import { useAssetView } from "@/components/market/asset-view"
import { useI18n } from "@/components/i18n/locale-provider"
import { Button } from "@/components/ui/button"

/** Mobile primary action: opens the same replay pop-up as the config footer button. */
function RunBacktestButton() {
  const { setReplayOpen } = useAssetView()
  const { t } = useI18n()
  return (
    <Button size="lg" type="button" className="w-full" onClick={() => setReplayOpen(true)}>
      <PlayIcon data-icon="inline-start" />
      {t("Ejecutar backtest", "Run backtest")}
    </Button>
  )
}

export { RunBacktestButton }
