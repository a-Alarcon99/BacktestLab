import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConicalIcon } from "lucide-react";
import { RecentBacktests } from "@/components/backtest/recent-backtests";
import { buttonVariants } from "@/components/ui/button";
import { PlanUsage } from "@/components/plan/plan-usage";
import { getI18n } from "@/lib/i18n-server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  // Its content is the visitor's own history, read from the browser: nothing to index.
  return pageMetadata({ locale, path: "/backtests", title: "Backtests", noindex: true });
}

export default async function BacktestsPage() {
  const { t, href } = await getI18n();
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1>{t("Últimos backtests", "Latest backtests")}</h1>
          <p className="max-w-2xl text-muted-foreground">
            {t(
              "Tus ejecuciones más recientes (según tu plan), guardadas en este navegador. Abre una para volver a ver la animación de la estrategia sobre el histórico. Borrar una no devuelve el cupo consumido.",
              "Your most recent runs (depending on your plan), saved in this browser. Open one to replay the strategy's animation over the history. Deleting one doesn't give back the quota it used."
            )}
          </p>
        </div>
        <Link
          href={href("/")}
          className={buttonVariants({ size: "lg", variant: "soft", className: "self-start sm:self-auto" })}
        >
          <FlaskConicalIcon data-icon="inline-start" />
          {t("Nuevo backtest", "New backtest")}
        </Link>
      </section>

      <PlanUsage />

      <RecentBacktests />
    </div>
  );
}
