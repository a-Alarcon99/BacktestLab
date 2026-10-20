import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PlanUsage } from "@/components/plan/plan-usage";
import { StrategyCount, StrategyList } from "@/components/strategy/strategy-list";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({
    locale,
    path: "/strategies",
    title: t("Estrategias", "Strategies"),
    description: t(
      "Estrategias de trading cripto para backtesting: tres predefinidas (rebote RSI + Bollinger, tendencia EMA 20/50 y ruptura Donchian) y las tuyas, con reglas de compra y venta combinables.",
      "Crypto trading strategies for backtesting: three built-in ones (RSI + Bollinger rebound, EMA 20/50 trend and Donchian breakout) and your own, with combinable buy and sell rules."
    ),
  });
}

export default async function StrategiesPage() {
  const [catalog, today, { t, href }] = await Promise.all([getAssetCatalog(), getToday(), getI18n()]);
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1>{t("Estrategias", "Strategies")}</h1>
          <p className="max-w-2xl text-muted-foreground">
            {t(
              "Reglas de compra y venta reutilizables en tus backtests, asociadas a tu cuenta (o a este navegador si eres invitado).",
              "Buy and sell rules you can reuse in your backtests, tied to your account (or to this browser if you're a guest)."
            )}{" "}
            <StrategyCount />
          </p>
        </div>
        <Link
          href={href("/strategies/new")}
          className={buttonVariants({ size: "lg", className: "self-start sm:self-auto" })}
        >
          <PlusIcon data-icon="inline-start" />
          {t("Nueva estrategia", "New strategy")}
        </Link>
      </section>

      <PlanUsage />

      <StrategyList assets={catalog} today={today} />
    </div>
  );
}
