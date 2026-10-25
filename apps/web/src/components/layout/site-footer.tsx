import Link from "next/link"
import { siteConfig } from "@/config/site"
import { getI18n } from "@/lib/i18n-server"
import { getToday } from "@/lib/market"

export async function SiteFooter() {
  const [{ locale, t, href }, today] = await Promise.all([getI18n(), getToday()])
  const year = today.slice(0, 4)
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="container-page grid gap-6 py-8 text-muted-foreground md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-8">
        <p className="text-caption md:justify-self-start">
          © {year} {siteConfig.name}. {t("Todos los derechos reservados.", "All rights reserved.")}
        </p>
        <p className="max-w-md text-caption md:text-center">{siteConfig.description[locale]}</p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 md:justify-self-end">
          {siteConfig.nav.map((item) => (
            <Link key={item.href} href={href(item.href)} className="hover:text-foreground">
              {item.label[locale]}
            </Link>
          ))}
        </nav>
      </div>
      <nav
        aria-label={t("Información legal", "Legal information")}
        className="container-page flex flex-wrap justify-center gap-x-6 gap-y-2 border-t py-4 text-caption text-muted-foreground"
      >
        {siteConfig.legal.map((item) => (
          <Link key={item.href} href={href(item.href)} className="hover:text-foreground">
            {item.label[locale]}
          </Link>
        ))}
      </nav>
    </footer>
  )
}
