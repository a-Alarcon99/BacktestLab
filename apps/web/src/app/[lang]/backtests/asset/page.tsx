import type { Metadata } from "next";
import { BacktestSubpage } from "@/components/backtest/hub/backtest-subpage";
import { SingleAssetPanel } from "@/components/backtest/hub/single-asset-panel";
import { getI18n } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/backtests/asset", title: t("Backtest de un activo", "Single-asset backtest"), noindex: true });
}

export default async function Page() {
  const [{ t }, catalog, today] = await Promise.all([getI18n(), getAssetCatalog(), getToday()]);
  return (
    <BacktestSubpage
      title={t("Backtest de un activo", "Single-asset backtest")}
      text={t(
        "Una estrategia sobre un activo, con la animación y el informe completo.",
        "One strategy on one asset, with the animation and the full report."
      )}
    >
      <SingleAssetPanel assets={catalog} today={today} />
    </BacktestSubpage>
  );
}
