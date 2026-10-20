import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Money } from "@/components/currency/currency-provider"
import { localizePath, translator, type Locale } from "@/lib/i18n"
import type { Asset } from "@/lib/market"
import { AssetAvatar } from "./asset-avatar"
import { PriceChange } from "./price-change"

/**
 * One asset per card: identity row, price as the dominant number,
 * then 24h / 7d / volume as label–value rows. The whole card links to the asset page.
 */
function AssetCard({ asset, locale }: { asset: Asset; locale: Locale }) {
  const t = translator(locale)
  return (
    <Link
      href={localizePath(locale, `/assets/${asset.symbol.toLowerCase()}`)}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground transition-colors outline-none hover:border-border-strong hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <div className="flex items-center gap-2.5">
        <AssetAvatar symbol={asset.symbol} size={32} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{asset.name}</span>
          <span className="text-caption font-medium text-muted-foreground">{asset.symbol}</span>
        </span>
        {asset.rank !== null && <Badge className="num">#{asset.rank}</Badge>}
      </div>

      <span className="num text-heading font-bold tracking-tight"><Money value={asset.price} /></span>

      <dl className="grid grid-cols-3 gap-3 border-t pt-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption text-muted-foreground">24h</dt>
          <dd>
            <PriceChange value={asset.change24h} locale={locale} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption text-muted-foreground">7d</dt>
          <dd>
            <PriceChange value={asset.change7d} locale={locale} />
          </dd>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <dt className="text-caption text-muted-foreground">{t("Volumen 24h", "24h volume")}</dt>
          <dd className="num font-semibold"><Money value={asset.volume24h} compact /></dd>
        </div>
      </dl>
    </Link>
  )
}

export { AssetCard }
