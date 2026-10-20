import { NextResponse, type NextRequest } from "next/server"
import { defaultLocale, isLocale, LOCALE_COOKIE, localizePath } from "@/lib/i18n"

// Language routing. Pages live under `app/[lang]`; Spanish (default) is served without prefix:
// - `/en/...`             → as is.
// - `/es/...`             → 308 to the unprefixed URL (one public URL per page), except the Open
//                           Graph images Next.js generates under `/es/.../opengraph-image`.
// - anything else         → rewritten to `/es/...`, or redirected to the remembered language when
//                           the visitor picked another one with the switcher (`bl_locale` cookie).
//                           Crawlers carry no cookie, so they always get the Spanish page.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const first = pathname.split("/")[1] ?? ""

  if (isLocale(first) && first !== defaultLocale) return NextResponse.next()

  if (first === defaultLocale) {
    if (pathname.includes("/opengraph-image")) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(defaultLocale.length + 1) || "/"
    return NextResponse.redirect(url, 308)
  }

  const preferred = request.cookies.get(LOCALE_COOKIE)?.value
  if (preferred && preferred !== defaultLocale && isLocale(preferred)) {
    const url = request.nextUrl.clone()
    url.pathname = localizePath(preferred, pathname)
    return NextResponse.redirect(url, 307)
  }

  const url = request.nextUrl.clone()
  url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`
  url.search = search
  return NextResponse.rewrite(url)
}

export const config = {
  // Pages only: not the route handlers, Next.js internals or files (anything with an extension,
  // e.g. `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/crypto/btc.png`).
  matcher: ["/((?!api/|_next/|.*\\.[^/]+$).*)"],
}
