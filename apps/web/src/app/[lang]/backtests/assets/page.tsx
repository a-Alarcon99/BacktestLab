import type { Metadata } from "next";
import { BacktestSubpage } from "@/components/backtest/hub/backtest-subpage";
import { MultiAssetPanel } from "@/components/backtest/hub/multi-asset-panel";
import { getI18n } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/backtests/assets", title: t("Backtest de varios activos", "Several-asset backtest"), noindex: true });
}

export default async function Page() {
  const [{ t }, catalog, today] = await Promise.all([getI18n(), getAssetCatalog(), getToday()]);
  return (
    <BacktestSubpage
      title={t("Backtest de varios activos", "Several-asset backtest")}
      text={t(
        "La misma estrategia en varios activos, cada uno con el capital completo: ¿funciona en todos o solo en uno?",
        "The same strategy on several assets, each with the full capital: does it work on all of them or just one?"
      )}
    >
      <MultiAssetPanel assets={catalog} today={today} />
    </BacktestSubpage>
  );
}
