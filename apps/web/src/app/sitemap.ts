import type { MetadataRoute } from "next"
import { localizePath, locales } from "@/lib/i18n"
import { getAssetCatalog } from "@/lib/market"
import { presetInfo } from "@/lib/preset-strategies"
import { absoluteUrl } from "@/lib/seo"

// Indexable pages only (the ones without `noindex`), in every language, each listing its
// translations as hreflang alternates.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getAssetCatalog()
  const pages: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "/", priority: 1, changeFrequency: "daily" },
    { path: "/strategies", priority: 0.8, changeFrequency: "weekly" },
    ...Object.keys(presetInfo).map((id) => ({
      path: `/strategies/${id}`,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    })),
    ...catalog.map((asset) => ({
      path: `/assets/${asset.symbol.toLowerCase()}`,
      priority: 0.9,
      changeFrequency: "daily" as const,
    })),
  ]

  return pages.flatMap(({ path, priority, changeFrequency }) => {
    const languages = Object.fromEntries(locales.map((l) => [l, absoluteUrl(localizePath(l, path))]))
    return locales.map((locale) => ({
      url: absoluteUrl(localizePath(locale, path)),
      changeFrequency,
      priority,
      alternates: { languages },
    }))
  })
}
