import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PlanUsage } from "@/components/plan/plan-usage";
import { StrategyCount, StrategyList } from "@/components/strategy/strategy-list";
import { buttonVariants } from "@/components/ui/button";
import { getAssetCatalog, getToday } from "@/lib/market";

export const metadata: Metadata = { title: "Estrategias" };

export default async function StrategiesPage() {
  const [catalog, today] = await Promise.all([getAssetCatalog(), getToday()]);
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1>Estrategias</h1>
          <p className="max-w-2xl text-muted-foreground">
            Reglas de compra y venta reutilizables en tus backtests, asociadas a tu cuenta (o a este navegador si eres invitado). <StrategyCount />
          </p>
        </div>
        <Link
          href="/strategies/new"
          className={buttonVariants({ size: "lg", className: "self-start sm:self-auto" })}
        >
          <PlusIcon data-icon="inline-start" />
          Nueva estrategia
        </Link>
      </section>

      <PlanUsage />

      <StrategyList assets={catalog} today={today} />
    </div>
  );
}
