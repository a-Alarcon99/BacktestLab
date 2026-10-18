import { notFound } from "next/navigation"
import { lang } from "next/root-params"
import { isLocale, localizePath, translator, type Locale } from "@/lib/i18n"

// Language of the current request in Server Components (the `[lang]` root segment).

export async function getLocale(): Promise<Locale> {
  const value = await lang()
  if (!isLocale(value)) notFound()
  return value
}

/** `locale`, a translator `t(es, en)` and `href(path)` for links in that language. */
export async function getI18n() {
  const locale = await getLocale()
  return { locale, t: translator(locale), href: (path: string) => localizePath(locale, path) }
}
