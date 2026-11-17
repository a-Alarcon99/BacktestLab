"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import { ChevronDownIcon, GlobeIcon } from "lucide-react"
import { cn } from "cn"
import { useLocale } from "@/components/i18n/locale-provider"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LOCALE_COOKIE, localizePath, locales, splitLocale, type Locale } from "@/lib/i18n"

const names: Record<Locale, string> = { es: "Español", en: "English" }

/** One year, readable by `proxy.ts`. */
function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Language dropdown: links to the same page in the other language and remembers the choice in a
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
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={current === "en" ? "Language" : "Idioma"}
        className={cn(
          "h-9 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-caption font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted",
          className ?? "inline-flex"
        )}
      >
        <GlobeIcon className="size-4 text-muted-foreground" />
        <span className="uppercase">{current}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {locales.map((locale) => (
          // A plain <a>: the other language has its own root layout, so it is a full page load anyway.
          <DropdownMenuItem
            key={locale}
            render={<a href={localizePath(locale, path)} hrefLang={locale} lang={locale} />}
            aria-current={locale === current ? "true" : undefined}
            onClick={() => remember(locale)}
            className={locale === current ? "text-primary" : undefined}
          >
            <span className="w-6 text-caption uppercase text-muted-foreground">{locale}</span>
            {names[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { LanguageSwitcher }
