import type { Metadata } from "next";
import { BacktestSubpage } from "@/components/backtest/hub/backtest-subpage";
import { McPanel } from "@/components/backtest/hub/mc-panel";
import { getI18n } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return pageMetadata({ locale, path: "/backtests/montecarlo", title: "Monte Carlo", noindex: true });
}

export default async function Page() {
  const [{ t }, catalog, today] = await Promise.all([getI18n(), getAssetCatalog(), getToday()]);
  return (
    <BacktestSubpage
      title={"Monte Carlo"}
      text={t(
        "Crea miles de historias alternativas de tu estrategia para ver si tiene una ventaja real o solo tuvo suerte.",
        "Creates thousands of alternative histories of your strategy to see whether it has a real edge or was just lucky."
      )}
    >
      <McPanel assets={catalog} today={today} />
    </BacktestSubpage>
  );
}
