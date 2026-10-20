import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PresetDetail } from "@/components/strategy/preset-detail";
import { localizePath } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { isPreset, presetInfo } from "@/lib/preset-strategies";
import { absoluteUrl, jsonLd, pageMetadata } from "@/lib/seo";

/** The built-in strategies are prerendered; other ids are users' strategies (redirected below). */
export function generateStaticParams() {
  return Object.keys(presetInfo).map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/strategies/[id]">): Promise<Metadata> {
  const [{ id }, { locale, t }] = await Promise.all([params, getI18n()]);
  const info = presetInfo[id];
  if (!info) return { title: t("Estrategia", "Strategy"), robots: { index: false, follow: true } };
  return pageMetadata({
    locale,
    path: `/strategies/${id}`,
    title: info.name[locale],
    description: `${info.summary[locale]} ${t("Velas", "Candles")}: ${info.timeframe[locale]} · ${info.holding[locale]}.`,
  });
}

/** `params` is URL data: it is resolved inside <Suspense> so the shell can be served instantly. */
export default function StrategyPage({ params }: PageProps<"/[lang]/strategies/[id]">) {
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-lg bg-muted/40" />}>
        <StrategyContent params={params} />
      </Suspense>
    </div>
  );
}

/** Read-only page of a built-in strategy; the user's own strategies go to the editor. */
async function StrategyContent({ params }: Pick<PageProps<"/[lang]/strategies/[id]">, "params">) {
  const [{ id }, { locale, t }] = await Promise.all([params, getI18n()]);
  if (!isPreset(id)) redirect(localizePath(locale, `/strategies/${id}/edit`));
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: t("Estrategias", "Strategies"),
        item: absoluteUrl(localizePath(locale, "/strategies")),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: presetInfo[id].name[locale],
        item: absoluteUrl(localizePath(locale, `/strategies/${id}`)),
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      <PresetDetail id={id} />
    </>
  );
}
