import { Suspense } from "react";
import { AssetCard } from "@/components/market/asset-card";
import {
  CategoryFilter,
  CategoryFilterItem,
  CategoryFilterProvider,
  CategoryFilterSearch,
} from "@/components/market/category-filter";
import { getAssetCatalog, getAssets } from "@/lib/market";

export default async function Home() {
  const catalog = await getAssetCatalog();
  const categories = [...new Set(catalog.map((asset) => asset.category))];

  return (
    <div className="container-page flex flex-col gap-8 py-6 lg:py-8">
      <section className="flex flex-col gap-2">
        <h1>Activos disponibles para backtest</h1>
        <p className="max-w-2xl text-muted-foreground">
          Elige un activo para configurar el rango de fechas, la temporalidad y la estrategia.{" "}
          <span className="num font-semibold text-foreground">{catalog.length} activos</span> con
          histórico OHLCV de Binance.
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
            <Suspense fallback={<AssetGridSkeleton count={catalog.length} />}>
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
  const assets = await getAssets();
  return assets.map((asset) => (
    <CategoryFilterItem key={asset.symbol} category={asset.category} name={asset.name} symbol={asset.symbol}>
      <AssetCard asset={asset} />
    </CategoryFilterItem>
  ));
}

function AssetGridSkeleton({ count }: { count: number }) {
  return Array.from({ length: count }, (_, i) => (
    <li key={i} aria-hidden className="h-[11.5rem] animate-pulse rounded-xl border bg-muted/40" />
  ));
}
