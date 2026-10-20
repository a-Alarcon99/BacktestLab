export const siteConfig = {
  name: "BacktestLab",
  /** Production origin; `NEXT_PUBLIC_APP_URL` overrides it (see `lib/seo.ts`). */
  url: "https://backtestlab.xyz",
  /** Title of the home page and of shared links without a page title. */
  title: {
    es: "BacktestLab · Backtesting de estrategias de trading cripto",
    en: "BacktestLab · Crypto trading strategy backtesting",
  },
  description: {
    es: "Backtesting de estrategias de trading cripto sobre cualquier rango de fechas y timeframe.",
    en: "Backtest crypto trading strategies over any date range and timeframe.",
  },
  nav: [
    { label: { es: "Activos", en: "Assets" }, href: "/" },
    { label: { es: "Backtests", en: "Backtests" }, href: "/backtests" },
    { label: { es: "Estrategias", en: "Strategies" }, href: "/strategies" },
    { label: { es: "Planes", en: "Plans" }, href: "/plans" },
  ],
} as const
