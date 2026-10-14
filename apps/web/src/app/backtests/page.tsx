import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConicalIcon } from "lucide-react";
import { RecentBacktests } from "@/components/backtest/recent-backtests";
import { buttonVariants } from "@/components/ui/button";
import { PlanUsage } from "@/components/plan/plan-usage";

export const metadata: Metadata = { title: "Backtests" };

export default function BacktestsPage() {
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1>Últimos backtests</h1>
          <p className="max-w-2xl text-muted-foreground">
            Tus ejecuciones más recientes (según tu plan), guardadas en este navegador. Abre una para volver a ver la
            animación de la estrategia sobre el histórico. Borrar una no devuelve el cupo consumido.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ size: "lg", variant: "soft", className: "self-start sm:self-auto" })}>
          <FlaskConicalIcon data-icon="inline-start" />
          Nuevo backtest
        </Link>
      </section>

      <PlanUsage />

      <RecentBacktests />
    </div>
  );
}
