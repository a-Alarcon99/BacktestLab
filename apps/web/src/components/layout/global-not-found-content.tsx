"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { siteConfig } from "@/config/site"
import { defaultLocale, isLocale, LOCALE_COOKIE, localizePath, translator, type Locale } from "@/lib/i18n"

const links = "rounded-lg px-4 py-2 font-semibold transition-colors"

/** Language of an unmatched URL: its prefix, else the remembered choice, else the browser's. */
function detectLocale(): Locale {
  const first = window.location.pathname.split("/")[1] ?? ""
  if (isLocale(first) && first !== defaultLocale) return first
  const saved = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1]
  if (saved && isLocale(saved)) return saved
  const browser = navigator.language.slice(0, 2).toLowerCase()
  return isLocale(browser) ? browser : defaultLocale
}

const subscribe = () => () => {}

/**
 * Body of `app/global-not-found.tsx`, which is prerendered without a request: the HTML is Spanish
 * and the language of the visitor is applied on the client, so the message appears only once.
 */
export function GlobalNotFoundContent() {
  const locale = useSyncExternalStore(subscribe, detectLocale, () => defaultLocale)
  const t = translator(locale)
  return (
    <>
      <Link href={localizePath(locale, "/")} className="flex items-center gap-2 text-title font-bold tracking-tight">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, black on transparent: inverted in dark mode */}
        <img src="/favicon.svg" alt="" width={36} height={36} className="size-9 dark:invert" />
        {siteConfig.name}
      </Link>
      <p className="num text-caption font-semibold text-muted-foreground">404</p>
      <section className="flex max-w-md flex-col items-center gap-3">
        <h1>{t("Página no encontrada", "Page not found")}</h1>
        <p className="text-muted-foreground">
          {t(
            "La página que buscas no existe o ha cambiado de dirección.",
            "The page you're looking for doesn't exist or has moved."
          )}
        </p>
        <Link href={localizePath(locale, "/")} className={`${links} bg-primary text-primary-foreground`}>
          {t("Ver activos", "View assets")}
        </Link>
      </section>
    </>
  )
}
