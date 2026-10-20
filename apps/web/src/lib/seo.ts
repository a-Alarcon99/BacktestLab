import type { Metadata } from "next"
import { siteConfig } from "@/config/site"
import { localizePath, locales, ogLocale, type Locale } from "@/lib/i18n"

// Shared SEO metadata: canonical + hreflang alternates, Open Graph / Twitter and robots.

/** Public origin of the site (absolute URLs in canonicals, Open Graph, sitemap and JSON-LD). */
export const siteUrl = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url).origin
  } catch {
    return siteConfig.url
  }
})()

export const absoluteUrl = (path: string) => new URL(path, siteUrl).toString()

/** hreflang map of an unprefixed `path`, with Spanish as `x-default`. */
export function languageAlternates(path: string) {
  return {
    ...Object.fromEntries(locales.map((l) => [l, localizePath(l, path)])),
    "x-default": localizePath("es", path),
  }
}

/**
 * Metadata of a page available in every language. `path` is the unprefixed path ("/strategies").
 * `noindex` keeps private or thin pages (forms, browser-only data) out of the index while their
 * links are still followed.
 */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  noindex = false,
}: {
  locale: Locale
  path: string
  title?: string
  description?: string
  noindex?: boolean
}): Metadata {
  const url = localizePath(locale, path)
  const desc = description ?? siteConfig.description[locale]
  const socialTitle = title ? `${title} · ${siteConfig.name}` : siteConfig.title[locale]
  // Setting `openGraph` replaces the inherited image, so the site-wide card (`[lang]/opengraph-image`)
  // is named here; pages with their own `opengraph-image` file (assets) still use theirs.
  const image = { url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: siteConfig.name }
  return {
    ...(title ? { title } : {}),
    description: desc,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      url,
      title: socialTitle,
      description: desc,
      locale: ogLocale[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => ogLocale[l]),
      images: [image],
    },
    twitter: { card: "summary_large_image", title: socialTitle, description: desc, images: [image] },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  }
}

/** `<script type="application/ld+json">` body, escaped so it can't close the tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c")
