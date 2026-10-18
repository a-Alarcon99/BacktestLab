"use client"

import { createContext, useContext, useMemo } from "react"
import { defaultLocale, localizePath, translator, type Locale } from "@/lib/i18n"

const LocaleContext = createContext<Locale>(defaultLocale)

/** Makes the page's language available to Client Components (set by the root layout). */
function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>
}

function useLocale() {
  return useContext(LocaleContext)
}

/** `locale`, a translator `t(es, en)` and `href(path)` for links in that language. */
function useI18n() {
  const locale = useLocale()
  return useMemo(
    () => ({ locale, t: translator(locale), href: (path: string) => localizePath(locale, path) }),
    [locale]
  )
}

export { LocaleProvider, useI18n, useLocale }
