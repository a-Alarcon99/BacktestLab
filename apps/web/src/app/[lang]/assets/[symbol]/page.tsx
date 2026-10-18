import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRightIcon, FlaskConicalIcon } from "lucide-react";
import { AssetBacktests } from "@/components/backtest/asset-backtests";
import { BacktestConfig } from "@/components/backtest/backtest-config";
import { GoToBacktestButton } from "@/components/backtest/go-to-backtest-button";
import { RunBacktestButton } from "@/components/backtest/run-backtest-button";
import { AssetHeader, AssetIdentity } from "@/components/market/asset-header";
import { AssetViewProvider } from "@/components/market/asset-view";
import { ChartSkeleton, LivePriceChart, PriceChartControls } from "@/components/market/live-price-chart";
import { RangeBar } from "@/components/market/range-bar";
import { StatList } from "@/components/market/stat-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryLabel } from "@/lib/categories";
import { defaultTimeframe } from "@/lib/candles";
import { Money } from "@/components/currency/currency-provider";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import {
  getAsset,
  getAssetCatalog,
  getAssetInfo,
  getPriceSeries,
  getToday,
  type Asset,
  type AssetInfo,
} from "@/lib/market";
import { absoluteUrl, jsonLd, pageMetadata } from "@/lib/seo";

export async function generateStaticParams() {
  const catalog = await getAssetCatalog();
  return catalog.map((a) => ({ symbol: a.symbol.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/assets/[symbol]">): Promise<Metadata> {
  const [{ locale, t }, info] = await Promise.all([getI18n(), getAssetInfo((await params).symbol)]);
  if (!info) return { title: t("Activo no encontrado", "Asset not found"), robots: { index: false } };
  const since = info.historySince.slice(0, 4);
  return pageMetadata({
    locale,
    // One URL per asset: `/assets/BTC` and `/assets/btc` both render, the lowercase one is canonical.
    path: `/assets/${info.symbol.toLowerCase()}`,
    title: t(`Backtest de ${info.name} (${info.symbol})`, `${info.name} (${info.symbol}) backtest`),
    description: t(
      `Prueba estrategias de trading sobre ${info.name} (${info.symbol}/USDT) con velas OHLCV de Binance desde ${since}: RSI, medias móviles, MACD, Bollinger y patrones de velas, en cualquier rango de fechas y temporalidad.`,
      `Backtest trading strategies on ${info.name} (${info.symbol}/USDT) with Binance OHLCV candles since ${since}: RSI, moving averages, MACD, Bollinger Bands and candlestick patterns, over any date range and timeframe.`
    ),
  });
}

/**
 * `params` is awaited outside <Suspense> on purpose: `notFound()` must run before streaming starts
 * to answer a real 404 (inside a boundary the status would already be 200, a "soft 404"). Every
 * catalog symbol comes from `generateStaticParams`, so those pages stay prerendered; unknown ones
 * render at request time and 404 (`dynamicParams = false` isn't supported with `cacheComponents`).
 */
export default async function AssetPage({ params }: PageProps<"/[lang]/assets/[symbol]">) {
  const info = await getAssetInfo((await params).symbol);
  if (!info) notFound();
  return (
    <Suspense fallback={<AssetPageSkeleton />}>
      <AssetContent info={info} />
    </Suspense>
  );
}

function AssetPageSkeleton() {
  return (
    <div
      aria-hidden
      className="container-page grid gap-6 py-6 lg:grid-cols-[var(--container-aside)_minmax(0,1fr)] lg:gap-8 lg:py-8"
    >
      <div className="h-96 animate-pulse rounded-lg bg-muted/40" />
      <div className="h-[40rem] animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}

async function AssetContent({ info }: { info: AssetInfo }) {
  const [today, { locale, t, href }] = await Promise.all([getToday(), getI18n()]);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("Activos", "Assets"), item: absoluteUrl(href("/")) },
      {
        "@type": "ListItem",
        position: 2,
        name: info.name,
        item: absoluteUrl(href(`/assets/${info.symbol.toLowerCase()}`)),
      },
    ],
  };

  return (
    <AssetViewProvider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      <div className="container-page grid gap-6 py-6 pb-24 lg:grid-cols-[var(--container-aside)_minmax(0,1fr)] lg:gap-8 lg:py-8 lg:pb-8">
        {/* Asset panel: first block on mobile, sticky column on desktop */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--spacing-header)+2rem)] lg:self-start">
          <nav aria-label={t("Ruta", "Breadcrumb")} className="flex items-center gap-1 text-caption text-muted-foreground">
            <Link href={href("/")} className="hover:text-foreground">
              {t("Activos", "Assets")}
            </Link>
            <ChevronRightIcon className="size-3" />
            <span className="font-semibold text-foreground">{info.name}</span>
          </nav>

          <Suspense fallback={<QuoteSkeleton info={info} />}>
            <AssetQuote info={info} locale={locale} />
          </Suspense>

          <div className="hidden gap-2 lg:flex">
            <GoToBacktestButton>
              <FlaskConicalIcon data-icon="inline-start" />
              {t("Configurar backtest", "Set up backtest")}
            </GoToBacktestButton>
          </div>

          <Suspense fallback={<AssetStats info={info} locale={locale} />}>
            <LiveAssetStats info={info} locale={locale} />
          </Suspense>

          <div className="flex flex-wrap gap-2">
            <Badge shape="pill" variant="primary">
              {categoryLabel(info.category, locale)}
            </Badge>
            <Badge shape="pill">Spot</Badge>
            <Badge shape="pill">OHLCV</Badge>
          </div>
        </aside>

        {/* Main column: the chart and the backtest config keep independent timeframes */}
        <div className="flex min-w-0 flex-col gap-6">
          <BacktestConfig symbol={info.symbol} historySince={info.historySince} today={today} />

          <Card>
            <CardHeader className="flex-wrap">
              <CardTitle>{t(`Precio de ${info.symbol}`, `${info.symbol} price`)}</CardTitle>
              <PriceChartControls />
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ChartSkeleton />}>
                <AssetPriceChart symbol={info.symbol} />
              </Suspense>
            </CardContent>
          </Card>

          <section aria-labelledby="asset-backtests" className="flex flex-col gap-3">
            <h2 id="asset-backtests" className="text-title font-bold">
              {t(`Backtests de ${info.symbol}`, `${info.symbol} backtests`)}
            </h2>
            <AssetBacktests symbol={info.symbol} />
          </section>
        </div>

        {/* Mobile: primary action pinned to the bottom edge */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <RunBacktestButton />
        </div>
      </div>
    </AssetViewProvider>
  );
}

/** Live price, 24h change and 24h range. Without a quote, only the asset's name and symbol. */
async function AssetQuote({ info, locale }: { info: AssetInfo; locale: Locale }) {
  const asset = await getAsset(info.symbol);
  if (!asset) return <AssetIdentity name={info.name} symbol={info.symbol} />;
  return (
    <>
      <AssetHeader
        name={asset.name}
        symbol={asset.symbol}
        rank={asset.rank ?? undefined}
        price={asset.price}
        change={asset.change24h}
        locale={locale}
      />
      <RangeBar
        label={locale === "en" ? "24h range" : "Rango 24h"}
        low={asset.low24h}
        high={asset.high24h}
        current={asset.price}
        locale={locale}
      />
    </>
  );
}

/** The heading is static (catalog data): only the price area waits for the API. */
function QuoteSkeleton({ info }: { info: AssetInfo }) {
  return (
    <div className="flex flex-col gap-3">
      <AssetIdentity name={info.name} symbol={info.symbol} />
      <div aria-hidden className="h-[6.75rem] animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}

async function LiveAssetStats({ info, locale }: { info: AssetInfo; locale: Locale }) {
  const asset = await getAsset(info.symbol);
  return <AssetStats info={info} asset={asset ?? undefined} locale={locale} />;
}

/** Without `asset` (while loading) the live values show as "—". */
function AssetStats({ info, asset, locale }: { info: AssetInfo; asset?: Asset; locale: Locale }) {
  const en = locale === "en";
  return (
    <StatList
      className="border-t"
      items={[
        {
          label: en ? "Market cap" : "Capitalización",
          value: asset?.marketCap != null ? <Money value={asset.marketCap} compact /> : "—",
        },
        { label: en ? "24h volume" : "Volumen 24h", value: asset ? <Money value={asset.volume24h} compact /> : "—" },
        { label: en ? "History since" : "Histórico desde", value: formatDate(info.historySince, locale) },
        { label: en ? "Pair" : "Par", value: `${info.symbol}/USDT` },
      ]}
    />
  );
}

/**
 * Server-renders the default timeframe; the client chart fetches the others on demand (and this one
 * too if the server could not load it).
 */
async function AssetPriceChart({ symbol }: { symbol: string }) {
  const candles = (await getPriceSeries(symbol, defaultTimeframe)) ?? undefined;
  return <LivePriceChart symbol={symbol} initialTimeframe={defaultTimeframe} initialCandles={candles} />;
}
