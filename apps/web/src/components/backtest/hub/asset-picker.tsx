"use client"

import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { Input } from "@/components/ui/input"
import type { AssetInfo } from "@/lib/market"

/**
 * Search box + grid of assets. `selected` are the highlighted symbols; `onPick` fires on every
 * click (the owner decides whether that selects one or toggles many). With `full`, the assets that
 * are not selected can't be picked (plan maximum reached).
 */
function AssetPicker({
  assets,
  selected,
  onPick,
  full = false,
}: {
  assets: AssetInfo[]
  selected: readonly string[]
  onPick: (symbol: string) => void
  full?: boolean
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? assets.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : assets
  }, [assets, query])

  return (
    <>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Buscar activo…", "Search assets…")}
          aria-label={t("Buscar activo", "Search assets")}
          className="pl-9"
        />
      </div>
      <div className="grid max-h-60 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((asset) => {
          const on = selected.includes(asset.symbol)
          const blocked = !on && full
          return (
            <button
              key={asset.symbol}
              type="button"
              aria-pressed={on}
              disabled={blocked}
              onClick={() => onPick(asset.symbol)}
              title={blocked ? t("Has llegado al máximo de tu plan", "You've reached your plan's maximum") : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-40",
                on ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted/60"
              )}
            >
              <AssetAvatar symbol={asset.symbol} size={24} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-caption font-semibold">{asset.symbol}</span>
                <span className="truncate text-[11px] text-muted-foreground">{asset.name}</span>
              </span>
            </button>
          )
        })}
        {shown.length === 0 && <p className="col-span-full p-2 text-caption text-muted-foreground">{t("Ningún activo coincide.", "No asset matches.")}</p>}
      </div>
    </>
  )
}

export { AssetPicker }
