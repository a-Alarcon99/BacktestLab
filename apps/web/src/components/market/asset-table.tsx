import Link from "next/link"
import { ArrowDownIcon, FlaskConicalIcon } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { formatCompact, formatDate, formatPrice } from "@/lib/format"
import type { Asset } from "@/lib/market"
import { AssetAvatar } from "./asset-avatar"
import { PriceChange } from "./price-change"
import { Sparkline } from "./sparkline"

const columns = [
  { label: "Precio", className: "" },
  { label: "24h", className: "" },
  { label: "7d", className: "" },
  { label: "Volumen 24h", className: "hidden md:table-cell" },
  { label: "Cap. de mercado", className: "hidden md:table-cell", sorted: true },
  { label: "Histórico desde", className: "hidden xl:table-cell" },
  { label: "Últimos 7 días", className: "hidden lg:table-cell", sparkline: true },
]

/**
 * Market table. The asset column stays pinned while the rest scrolls horizontally;
 * secondary columns drop out progressively on smaller screens.
 * The 7-day sparkline column is shown only when `sparklines` (closes by symbol) is passed.
 */
function AssetTable({ assets, sparklines }: { assets: Asset[]; sparklines?: Record<string, number[]> }) {
  const visibleColumns = sparklines ? columns : columns.filter((col) => !col.sparkline)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] md:min-w-0">
        <thead>
          <tr className="border-y text-caption text-muted-foreground">
            <th className="sticky left-0 z-10 bg-background py-3 pr-4 text-left font-semibold">
              <span className="inline-block w-8">#</span>Activo
            </th>
            {visibleColumns.map((col) => (
              <th
                key={col.label}
                aria-sort={col.sorted ? "descending" : undefined}
                className={cn("px-3 py-3 text-right font-semibold whitespace-nowrap", col.className)}
              >
                <span className={cn("inline-flex items-center gap-1", col.sorted && "text-foreground")}>
                  {col.sorted && <ArrowDownIcon className="size-3" />}
                  {col.label}
                </span>
              </th>
            ))}
            <th className="py-3 pl-3">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const href = `/assets/${asset.symbol.toLowerCase()}`
            return (
              <tr key={asset.symbol} className="group border-b transition-colors hover:bg-muted/50">
                <td className="sticky left-0 z-10 bg-background py-4 pr-4 transition-colors group-hover:bg-muted">
                  <Link href={href} className="flex items-center">
                    <span className="num w-8 shrink-0 text-caption text-muted-foreground">{asset.rank ?? "—"}</span>
                    <AssetAvatar symbol={asset.symbol} size={24} className="mr-2.5" />
                    <span className="flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-2">
                      <span className="truncate font-semibold">{asset.name}</span>
                      <span className="text-caption font-medium text-muted-foreground md:text-body">
                        {asset.symbol}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="num px-3 py-4 text-right font-semibold whitespace-nowrap">
                  {formatPrice(asset.price)}
                </td>
                <td className="px-3 py-4 text-right">
                  <PriceChange value={asset.change24h} />
                </td>
                <td className="px-3 py-4 text-right">
                  <PriceChange value={asset.change7d} />
                </td>
                <td className="num hidden px-3 py-4 text-right whitespace-nowrap md:table-cell">
                  {formatCompact(asset.volume24h)}
                </td>
                <td className="num hidden px-3 py-4 text-right whitespace-nowrap md:table-cell">
                  {asset.marketCap === null ? "—" : formatCompact(asset.marketCap)}
                </td>
                <td className="num hidden px-3 py-4 text-right whitespace-nowrap text-muted-foreground xl:table-cell">
                  {formatDate(asset.historySince)}
                </td>
                {sparklines && (
                  <td className="hidden px-3 py-2 lg:table-cell">
                    {sparklines[asset.symbol] && <Sparkline values={sparklines[asset.symbol]} className="ml-auto" />}
                  </td>
                )}
                <td className="py-4 pl-3 text-right">
                  <Link
                    href={href}
                    aria-label={`Hacer backtest de ${asset.name}`}
                    className={buttonVariants({ variant: "soft", size: "sm" })}
                  >
                    <FlaskConicalIcon data-icon="inline-start" />
                    <span className="hidden sm:inline">Backtest</span>
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export { AssetTable }
