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
    { label: { es: "Activos", en: "Assets" }, href: "/assets" },
    { label: { es: "Backtests", en: "Backtests" }, href: "/backtests" },
    { label: { es: "Estrategias", en: "Strategies" }, href: "/strategies" },
    { label: { es: "Planes", en: "Plans" }, href: "/plans" },
  ],
  /** Legal pages, linked from the footer and the sign-up form. */
  legal: [
    { label: { es: "Privacidad", en: "Privacy" }, href: "/privacy" },
    { label: { es: "Términos", en: "Terms" }, href: "/terms" },
    { label: { es: "Cookies", en: "Cookies" }, href: "/cookies" },
    { label: { es: "Aviso legal", en: "Legal notice" }, href: "/legal" },
  ],
  /**
   * Data of the service provider shown in the legal pages (LSSI art. 10). PLACEHOLDERS: fill in
   * before going public. Texts of the legal pages are drafts to be reviewed by a lawyer.
   */
  operator: {
    name: "[Nombre o razón social del titular]",
    taxId: "[NIF/CIF]",
    address: "[Domicilio postal]",
    email: "[correo de contacto]",
  },
  /** Last review of the legal texts (ISO date). */
  legalUpdated: "2026-10-25",
} as const
