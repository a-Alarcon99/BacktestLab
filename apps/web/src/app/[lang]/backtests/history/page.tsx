import type { Metadata } from "next";
import { BacktestSubpage } from "@/components/backtest/hub/backtest-subpage";
import { RecentBacktests } from "@/components/backtest/recent-backtests";
import { getI18n } from "@/lib/i18n-server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  // Its content is the visitor's own history, read from the browser: nothing to index.
  return pageMetadata({ locale, path: "/backtests/history", title: t("Historial de backtests", "Backtest history"), noindex: true });
}

export default async function HistoryPage() {
  const { t } = await getI18n();
  return (
    <BacktestSubpage
      title={t("Historial", "History")}
      text={t(
        "Tus ejecuciones más recientes (según tu plan), guardadas en este navegador. Abre una para volver a ver la animación sobre el histórico. Borrar una no devuelve el cupo consumido.",
        "Your most recent runs (depending on your plan), saved in this browser. Open one to replay the animation over the history. Deleting one doesn't give back the quota it used."
      )}
    >
      <RecentBacktests />
    </BacktestSubpage>
  );
}
