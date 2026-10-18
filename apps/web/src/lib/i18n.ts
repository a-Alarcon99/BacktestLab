// Languages of the site. Client-safe (no server imports): used by the proxy, server and client code.
//
// Spanish is the default and keeps the unprefixed URLs (`/strategies`); every other language lives
// under its own prefix (`/en/strategies`). Internally all pages are under `app/[lang]`: `proxy.ts`
// rewrites unprefixed paths to `/es/...`.

export const locales = ["es", "en"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "es"

/** Remembers the language picked with the switcher (read by `proxy.ts`). */
export const LOCALE_COOKIE = "bl_locale"

export const isLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value)

/** BCP 47 tag for `Intl` formatting. */
export const intlLocale: Record<Locale, string> = { es: "es-ES", en: "en-US" }

/** Open Graph `og:locale`. */
export const ogLocale: Record<Locale, string> = { es: "es_ES", en: "en_US" }

/** Text in every language. */
export type Text = Record<Locale, string>

/** Public URL path of `path` (unprefixed, starting with "/") in `locale`. */
export function localizePath(locale: Locale, path: string) {
  if (locale === defaultLocale) return path
  return path === "/" ? `/${locale}` : `/${locale}${path}`
}

/**
 * Splits a pathname into its language and the unprefixed path. Accepts both the public URL and the
 * internal one (`/es/...`, what `usePathname()` reads while prerendering a rewritten page).
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split("/")
  if (first && isLocale(first)) return { locale: first, path: `/${rest.join("/")}` }
  return { locale: defaultLocale, path: pathname || "/" }
}

/** `t("Hola", "Hello")`: picks the string (or node) of `locale`. */
export type Translate = <T>(es: T, en: T) => T

export const translator =
  (locale: Locale): Translate =>
  (es, en) =>
    locale === "en" ? en : es
