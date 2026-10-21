import type { Metadata } from "next";
import { AnalysisSection } from "@/components/landing/analysis-section";
import { Capabilities } from "@/components/landing/capabilities";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PresetsSection } from "@/components/landing/presets-section";
import { ProofBar } from "@/components/landing/proof-bar";
import { faqItems, StartFree } from "@/components/landing/start-free";
import { siteConfig } from "@/config/site";
import { getI18n, getLocale } from "@/lib/i18n-server";
import { getAssetCatalog, getToday } from "@/lib/market";
import { getStarterLimits } from "@/lib/plans";
import { absoluteUrl, jsonLd, pageMetadata, siteUrl } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ locale: await getLocale(), path: "/" });
}

/**
 * Landing page. Fully prerendered: the catalog and plan limits come from Postgres (cached) and the
 * animations use a committed snapshot of real backtests (`lib/landing/snapshot.json`), so nothing
 * here waits for the API. The asset catalog itself lives at `/assets`.
 */
export default async function Home() {
  const [{ locale, t, href }, catalog, today, limits] = await Promise.all([
    getI18n(),
    getAssetCatalog(),
    getToday(),
    getStarterLimits(),
  ]);
  const since = catalog.reduce((min, a) => (a.historySince < min ? a.historySince : min), today).slice(0, 4);
  const years = Number(today.slice(0, 4)) - Number(since);
  const faq = faqItems(t, { limits, since });

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: siteConfig.name,
      url: absoluteUrl(href("/")),
      description: siteConfig.description[locale],
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      inLanguage: locale,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: locale,
      mainEntity: faq.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  return (
    <div className="flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <Hero guestBacktests={limits.guest?.maxBacktestsTotal ?? null} since={since} />
      <ProofBar assets={catalog.length} years={years} />
      <HowItWorks />
      <AnalysisSection />
      <PresetsSection />
      <Capabilities />
      <StartFree limits={limits} since={since} />
      <FinalCta assets={catalog.length} />
    </div>
  );
}
