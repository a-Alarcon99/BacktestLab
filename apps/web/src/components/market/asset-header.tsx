import { Badge } from "@/components/ui/badge"
import { formatPrice } from "@/lib/format"
import { AssetAvatar } from "./asset-avatar"
import { PriceChange } from "./price-change"

/**
 * Asset identity block: icon + name + symbol + rank on one line,
 * then the price as the largest number on the page with its change next to it.
 */
function AssetHeader({
  name,
  symbol,
  rank,
  price,
  change,
  changeLabel = "24h",
  iconSrc,
  currency = "USD",
}: {
  name: string
  symbol: string
  rank?: number
  price: number
  change: number
  changeLabel?: string
  iconSrc?: string
  currency?: string
}) {
  const formatted = formatPrice(price, currency)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <AssetAvatar symbol={symbol} src={iconSrc} size={32} />
        <h1 className="truncate text-title font-bold">{name}</h1>
        <span className="text-body font-medium text-muted-foreground">{symbol}</span>
        {rank !== undefined && <Badge className="num">#{rank}</Badge>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="num text-price font-bold tracking-tight">{formatted}</span>
        <span className="inline-flex items-center gap-1.5">
          <PriceChange value={change} variant="pill" />
          <span className="text-caption text-muted-foreground">({changeLabel})</span>
        </span>
      </div>
    </div>
  )
}

export { AssetHeader }
