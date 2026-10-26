import type { Metadata } from "next";
import { BacktestSubpage } from "@/components/backtest/hub/backtest-subpage";
import { RobustPanel } from "@/components/backtest/hub/robust-panels";
import { getI18n } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/backtests/timeframes", title: t("Temporalidades vecinas", "Neighbouring timeframes"), noindex: true });
}

export default async function Page() {
  const [{ t }, catalog, today] = await Promise.all([getI18n(), getAssetCatalog(), getToday()]);
  return (
    <BacktestSubpage
      title={t("Temporalidades vecinas", "Neighbouring timeframes")}
      text={t(
        "El mismo rango en la temporalidad elegida y las de al lado: comprueba que el resultado no sea casualidad de una sola.",
        "The same range on the chosen timeframe and the ones next to it: check the result isn't a fluke of a single one."
      )}
    >
      <RobustPanel test="timeframes" assets={catalog} today={today} />
    </BacktestSubpage>
  );
}
