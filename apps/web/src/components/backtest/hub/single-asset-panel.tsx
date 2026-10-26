"use client"

import { useState } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Select } from "@/components/ui/input"
import type { AssetInfo } from "@/lib/market"
import { BacktestConfigCard } from "../backtest-config"

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
          <Field label={t("Activo a probar", "Asset to test")} htmlFor="hub-asset">
            <Select id="hub-asset" name="asset" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} · {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>
      {/* Keyed by asset: the range and timeframe start over, because the history differs. */}
      <BacktestConfigCard key={asset.symbol} symbol={asset.symbol} historySince={asset.historySince} today={today} open={open} onOpenChange={setOpen} />
    </div>
  )
}
