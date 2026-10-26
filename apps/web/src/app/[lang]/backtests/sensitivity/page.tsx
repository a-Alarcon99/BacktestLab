import type { Metadata } from "next";
import { BacktestSubpage } from "@/components/backtest/hub/backtest-subpage";
import { RobustPanel } from "@/components/backtest/hub/robust-panels";
import { getI18n } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/backtests/sensitivity", title: t("Sensibilidad de parámetros", "Parameter sensitivity"), noindex: true });
}

export default async function Page() {
  const [{ t }, catalog, today] = await Promise.all([getI18n(), getAssetCatalog(), getToday()]);
  return (
    <BacktestSubpage
      title={t("Sensibilidad de parámetros", "Parameter sensitivity")}
      text={t(
        "Varía uno o dos parámetros ±20 %: una meseta indica robustez, un pico aislado indica sobreajuste.",
        "Varies one or two parameters by ±20 %: a plateau means robustness, an isolated peak means overfitting."
      )}
    >
      <RobustPanel test="sensitivity" assets={catalog} today={today} />
    </BacktestSubpage>
  );
}
