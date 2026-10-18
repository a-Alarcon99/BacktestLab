import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { CurrencyProvider } from "@/components/currency/currency-provider";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeScript } from "@/components/layout/theme-script";
import { siteConfig } from "@/config/site";
import { getRates } from "@/lib/fx";
import { locales, ogLocale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { absoluteUrl, jsonLd, siteUrl } from "@/lib/seo";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Ceiling for rendering any page on demand: live market data comes from the API, whose free
// instance may need up to a minute to wake up (`apiFetch` gives up after 55 s).
export const maxDuration = 60;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    metadataBase: new URL(siteUrl),
    title: { default: siteConfig.title[locale], template: `%s · ${siteConfig.name}` },
    description: siteConfig.description[locale],
    applicationName: siteConfig.name,
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: ogLocale[locale],
      title: siteConfig.title[locale],
      description: siteConfig.description[locale],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, rates] = await Promise.all([getLocale(), getRates()]);
  // Site-wide entity: who publishes the site and what it is.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: siteConfig.name,
        url: absoluteUrl("/"),
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: siteConfig.name,
        url: absoluteUrl("/"),
        description: siteConfig.description[locale],
        inLanguage: locales,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      </head>
      <body className="flex min-h-full flex-col">
        <LocaleProvider locale={locale}>
          <CurrencyProvider rates={rates}>
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
            <SiteFooter />
          </CurrencyProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
