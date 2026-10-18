"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import { cn } from "cn"
import { useLocale } from "@/components/i18n/locale-provider"
import { LOCALE_COOKIE, localizePath, locales, splitLocale, type Locale } from "@/lib/i18n"

const names: Record<Locale, string> = { es: "Español", en: "English" }

/** One year, readable by `proxy.ts`. */
function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}

/**
 * ES / EN toggle: links to the same page in the other language and remembers the choice in a
 * cookie, so `proxy.ts` sends unprefixed URLs (bookmarks, emails) to that language next time.
 */
function LanguageSwitcher({ className }: { className?: string }) {
  return (
    // Pages with params unknown at build time can't read the pathname while prerendering: their
    // shell links to each language's home until the client renders the real links.
    <Suspense fallback={<Links path="/" className={className} />}>
      <CurrentPageLinks className={className} />
    </Suspense>
  )
}

function CurrentPageLinks({ className }: { className?: string }) {
  const { path } = splitLocale(usePathname())
  return <Links path={path} className={className} />
}

function Links({ path, className }: { path: string; className?: string }) {
  const current = useLocale()
  return (
    <nav
      aria-label={current === "en" ? "Language" : "Idioma"}
      className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}
    >
      {locales.map((locale) => {
        const active = locale === current
        return (
          // A plain <a>: the other language has its own root layout, so it is a full page load anyway.
          <a
            key={locale}
            href={localizePath(locale, path)}
            hrefLang={locale}
            lang={locale}
            title={names[locale]}
            aria-current={active ? "true" : undefined}
            onClick={() => remember(locale)}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2 text-caption font-semibold uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "bg-background text-foreground shadow-sm dark:bg-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {locale}
          </a>
        )
      })}
    </nav>
  )
}

export { LanguageSwitcher }
