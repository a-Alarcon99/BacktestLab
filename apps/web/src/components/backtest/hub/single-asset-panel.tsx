"use client"

import { useState } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/input"
import type { AssetInfo } from "@/lib/market"
import { BacktestConfigCard } from "../backtest-config"
import { AssetPicker } from "./asset-picker"

/** One strategy on one asset, with the animation and the full report. */
export function SingleAssetPanel({ assets, today }: { assets: AssetInfo[]; today: string }) {
  const { t } = useI18n()
  const [symbol, setSymbol] = useState(assets[0]?.symbol ?? "")
  const [open, setOpen] = useState(false)
  const asset = assets.find((a) => a.symbol === symbol)
  if (!asset) return null
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("Activo", "Asset")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label={t("Activo a probar", "Asset to test")}
            hint={t(
              "Elige el activo sobre el que se ejecuta la estrategia.",
              "Pick the asset the strategy runs on."
            )}
          >
            <AssetPicker assets={assets} selected={[symbol]} onPick={setSymbol} />
          </Field>
        </CardContent>
      </Card>
      {/* Keyed by asset: the range and timeframe start over, because the history differs. */}
      <BacktestConfigCard key={asset.symbol} symbol={asset.symbol} historySince={asset.historySince} today={today} open={open} onOpenChange={setOpen} />
    </div>
  )
}
