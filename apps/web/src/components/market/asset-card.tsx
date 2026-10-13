import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { formatCompact, formatPrice } from "@/lib/format"
import type { Asset } from "@/lib/market"
import { AssetAvatar } from "./asset-avatar"
import { PriceChange } from "./price-change"

/**
 * One asset per card: identity row, price as the dominant number,
 * then 24h / 7d / volume as label–value rows. The whole card links to the asset page.
 */
function AssetCard({ asset }: { asset: Asset }) {
  return (
    <Link
      href={`/assets/${asset.symbol.toLowerCase()}`}
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

      <span className="num text-heading font-bold tracking-tight">{formatPrice(asset.price)}</span>

      <dl className="grid grid-cols-3 gap-3 border-t pt-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption text-muted-foreground">24h</dt>
          <dd>
            <PriceChange value={asset.change24h} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-caption text-muted-foreground">7d</dt>
          <dd>
            <PriceChange value={asset.change7d} />
          </dd>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <dt className="text-caption text-muted-foreground">Volumen 24h</dt>
          <dd className="num font-semibold">{formatCompact(asset.volume24h)}</dd>
        </div>
      </dl>
    </Link>
  )
}

export { AssetCard }
