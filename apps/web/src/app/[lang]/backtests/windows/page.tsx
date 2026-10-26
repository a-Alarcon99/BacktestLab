import type { Metadata } from "next";
import { BacktestSubpage } from "@/components/backtest/hub/backtest-subpage";
import { RobustPanel } from "@/components/backtest/hub/robust-panels";
import { getI18n } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/backtests/windows", title: t("Ventanas móviles", "Rolling windows"), noindex: true });
}

export default async function Page() {
  const [{ t }, catalog, today] = await Promise.all([getI18n(), getAssetCatalog(), getToday()]);
  return (
    <BacktestSubpage
      title={t("Ventanas móviles", "Rolling windows")}
      text={t(
        "Reinicia la estrategia en tramos sucesivos del rango y mide en cuántos gana y cuánto cae en cada uno.",
        "Restarts the strategy on successive slices of the range and measures in how many it wins and how far it falls in each."
      )}
    >
      <RobustPanel test="windows" assets={catalog} today={today} />
    </BacktestSubpage>
  );
}
