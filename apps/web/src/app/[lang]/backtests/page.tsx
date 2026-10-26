import type { Metadata } from "next";
import { BacktestHub } from "@/components/backtest/hub/backtest-hub";
import { PlanUsage } from "@/components/plan/plan-usage";
import { getI18n } from "@/lib/i18n-server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  // Its content is the visitor's own history, read from the browser: nothing to index.
  return pageMetadata({ locale, path: "/backtests", title: "Backtests", noindex: true });
}

export default async function BacktestsPage() {
  const { t } = await getI18n();
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <section className="flex flex-col gap-2">
        <h1>Backtests</h1>
        <p className="max-w-2xl text-muted-foreground">
          {t(
            "Elige cómo probar tu estrategia: sobre un activo, sobre varios, o con una prueba de robustez para saber si resiste cambios de periodo, de parámetros y de temporalidad.",
            "Choose how to test your strategy: on one asset, on several, or with a robustness test to see whether it holds up when the period, the parameters and the timeframe change."
          )}
        </p>
      </section>

      <BacktestHub />

      <PlanUsage />
    </div>
  );
}
