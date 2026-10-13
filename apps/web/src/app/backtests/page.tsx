import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConicalIcon } from "lucide-react";
import { BacktestList } from "@/components/backtest/backtest-list";
import { buttonVariants } from "@/components/ui/button";
import { recentBacktests } from "@/lib/backtests-mock";

export const metadata: Metadata = { title: "Backtests" };

export default function BacktestsPage() {
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1>Últimos backtests</h1>
          <p className="max-w-2xl text-muted-foreground">
            Tus {recentBacktests.length} ejecuciones más recientes. Abre una para ver la animación de la estrategia
            sobre el histórico.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ size: "lg", variant: "soft", className: "self-start sm:self-auto" })}>
          <FlaskConicalIcon data-icon="inline-start" />
          Nuevo backtest
        </Link>
      </section>

      <BacktestList backtests={recentBacktests} />
    </div>
  );
}
