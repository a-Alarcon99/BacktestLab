import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRightIcon, FlaskConicalIcon, StarIcon } from "lucide-react";
import { BacktestConfig } from "@/components/backtest/backtest-config";
import { RunBacktestButton } from "@/components/backtest/run-backtest-button";
import { AssetHeader } from "@/components/market/asset-header";
import { AssetViewProvider } from "@/components/market/asset-view";
import { ChartSkeleton, LivePriceChart, PriceChartControls } from "@/components/market/live-price-chart";
import { RangeBar } from "@/components/market/range-bar";
import { StatList } from "@/components/market/stat-list";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultTimeframe } from "@/lib/candles";
import { formatCompact, formatDate } from "@/lib/format";
import {
  getAsset,
  getAssetCatalog,
  getAssetInfo,
  getPriceSeries,
  getToday,
  type Asset,
  type AssetInfo,
} from "@/lib/market";

export async function generateStaticParams() {
  const catalog = await getAssetCatalog();
  return catalog.map((a) => ({ symbol: a.symbol.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps<"/assets/[symbol]">): Promise<Metadata> {
  const info = await getAssetInfo((await params).symbol);
  return { title: info ? `${info.name} (${info.symbol})` : "Activo no encontrado" };
}

const resultMetrics = ["Rentabilidad", "Drawdown máx.", "Ratio de Sharpe", "Tasa de acierto", "Operaciones"];

/** `params` is URL data: it is resolved inside <Suspense> so the shell can be served instantly. */
export default function AssetPage({ params }: PageProps<"/assets/[symbol]">) {
  return (
    <Suspense fallback={<AssetPageSkeleton />}>
      <AssetContent params={params} />
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

async function AssetContent({ params }: Pick<PageProps<"/assets/[symbol]">, "params">) {
  const [info, today] = await Promise.all([getAssetInfo((await params).symbol), getToday()]);
  if (!info) notFound();

  return (
    <AssetViewProvider>
      <div className="container-page grid gap-6 py-6 pb-24 lg:grid-cols-[var(--container-aside)_minmax(0,1fr)] lg:gap-8 lg:py-8 lg:pb-8">
        {/* Asset panel: first block on mobile, sticky column on desktop */}
        <aside className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--spacing-header)+2rem)] lg:self-start">
          <nav aria-label="Ruta" className="flex items-center gap-1 text-caption text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Activos
            </Link>
            <ChevronRightIcon className="size-3" />
            <span className="font-semibold text-foreground">{info.name}</span>
          </nav>

          <Suspense fallback={<QuoteSkeleton />}>
            <AssetQuote symbol={info.symbol} />
          </Suspense>

          <div className="hidden gap-2 lg:flex">
            <Link href="#backtest" className={buttonVariants({ size: "lg", variant: "soft", className: "flex-1" })}>
              <FlaskConicalIcon data-icon="inline-start" />
              Configurar backtest
            </Link>
            <Button size="icon-lg" variant="outline" aria-label="Añadir a favoritos">
              <StarIcon />
            </Button>
          </div>

          <Suspense fallback={<AssetStats info={info} />}>
            <LiveAssetStats info={info} />
          </Suspense>

          <div className="flex flex-wrap gap-2">
            <Badge shape="pill" variant="primary">
              {info.category}
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
              <CardTitle>Precio de {info.symbol}</CardTitle>
              <PriceChartControls />
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ChartSkeleton />}>
                <AssetPriceChart symbol={info.symbol} />
              </Suspense>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resultados</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {resultMetrics.map((metric) => (
                  <div key={metric} className="rounded-lg bg-muted/60 px-3 py-2.5">
                    <dt className="text-caption text-muted-foreground">{metric}</dt>
                    <dd className="num text-title font-bold text-muted-foreground/60">—</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <FlaskConicalIcon className="size-5" />
                </span>
                <p className="font-semibold">Todavía no hay resultados</p>
                <p className="max-w-sm text-caption text-muted-foreground">
                  Elige el rango de fechas, la temporalidad y la estrategia, y ejecuta el backtest para ver la curva de
                  capital y las operaciones.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile: primary action pinned to the bottom edge */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <RunBacktestButton />
        </div>
      </div>
    </AssetViewProvider>
  );
}

/** Live price, 24h change and 24h range. */
async function AssetQuote({ symbol }: { symbol: string }) {
  const asset = await getAsset(symbol);
  if (!asset) return null;
  return (
    <>
      <AssetHeader
        name={asset.name}
        symbol={asset.symbol}
        rank={asset.rank ?? undefined}
        price={asset.price}
        change={asset.change24h}
      />
      <RangeBar label="Rango 24h" low={asset.low24h} high={asset.high24h} current={asset.price} />
    </>
  );
}

function QuoteSkeleton() {
  return <div aria-hidden className="h-[9.5rem] animate-pulse rounded-lg bg-muted/40" />;
}

async function LiveAssetStats({ info }: { info: AssetInfo }) {
  const asset = await getAsset(info.symbol);
  return <AssetStats info={info} asset={asset ?? undefined} />;
}

/** Without `asset` (while loading) the live values show as "—". */
function AssetStats({ info, asset }: { info: AssetInfo; asset?: Asset }) {
  return (
    <StatList
      className="border-t"
      items={[
        { label: "Capitalización", value: asset?.marketCap != null ? formatCompact(asset.marketCap) : "—" },
        { label: "Volumen 24h", value: asset ? formatCompact(asset.volume24h) : "—" },
        { label: "Histórico desde", value: formatDate(info.historySince) },
        { label: "Par", value: `${info.symbol}/USDT` },
      ]}
    />
  );
}

/** Server-renders the default timeframe; the client chart fetches the others on demand. */
async function AssetPriceChart({ symbol }: { symbol: string }) {
  const candles = await getPriceSeries(symbol, defaultTimeframe);
  return <LivePriceChart symbol={symbol} initialTimeframe={defaultTimeframe} initialCandles={candles} />;
}
