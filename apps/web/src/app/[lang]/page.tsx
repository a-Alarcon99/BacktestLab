import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AssetCard } from "@/components/market/asset-card";
import {
  CategoryFilter,
  CategoryFilterItem,
  CategoryFilterProvider,
  CategoryFilterSearch,
} from "@/components/market/category-filter";
import { siteConfig } from "@/config/site";
import { getI18n, getLocale } from "@/lib/i18n-server";
import { getAssetCatalog, getAssets, type AssetInfo } from "@/lib/market";
import { absoluteUrl, jsonLd, pageMetadata, siteUrl } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ locale: await getLocale(), path: "/" });
}

export default async function Home() {
  const [{ locale, t, href }, catalog] = await Promise.all([getI18n(), getAssetCatalog()]);
  const categories = [...new Set(catalog.map((asset) => asset.category))];
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteConfig.name,
    url: absoluteUrl(href("/")),
    description: siteConfig.description[locale],
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    inLanguage: locale,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": `${siteUrl}/#organization` },
  };

  return (
    <div className="container-page flex flex-col gap-8 py-6 lg:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <section className="flex flex-col gap-2">
        <h1>{t("Activos disponibles para backtest", "Assets available for backtesting")}</h1>
        <p className="max-w-2xl text-muted-foreground">
          {t(
            "Elige un activo para configurar el rango de fechas, la temporalidad y la estrategia.",
            "Pick an asset to set the date range, the timeframe and the strategy."
          )}{" "}
          <span className="num font-semibold text-foreground">
            {catalog.length} {t("activos", "assets")}
          </span>{" "}
          {t("con histórico OHLCV de Binance.", "with Binance OHLCV history.")}
        </p>
      </section>

      <CategoryFilterProvider>
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CategoryFilter
              categories={categories}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0"
            />
            <CategoryFilterSearch className="lg:w-64" />
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Suspense fallback={<AssetGridSkeleton catalog={catalog} href={href} />}>
              <AssetGrid />
            </Suspense>
          </ul>
        </section>
      </CategoryFilterProvider>
    </div>
  );
}

/** Live prices: resolved at request time (short-lived cache). */
async function AssetGrid() {
  const [assets, locale] = await Promise.all([getAssets(), getLocale()]);
  return assets.map((asset) => (
    <CategoryFilterItem key={asset.symbol} category={asset.category} name={asset.name} symbol={asset.symbol}>
      <AssetCard asset={asset} locale={locale} />
    </CategoryFilterItem>
  ));
}

/**
 * Placeholder cards while the prices load. They come from the static catalog and already link to
 * each asset, so the links are in the prerendered HTML even when the API takes long to answer.
 */
function AssetGridSkeleton({ catalog, href }: { catalog: AssetInfo[]; href: (path: string) => string }) {
  return catalog.map((asset) => (
    <li key={asset.symbol}>
      <Link
        href={href(`/assets/${asset.symbol.toLowerCase()}`)}
        className="block h-[11.5rem] animate-pulse rounded-xl border bg-muted/40"
      >
        <span className="sr-only">
          {asset.name} ({asset.symbol})
        </span>
      </Link>
    </li>
  ));
}
