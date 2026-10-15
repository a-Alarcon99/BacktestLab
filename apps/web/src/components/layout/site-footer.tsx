import Link from "next/link"
import { siteConfig } from "@/config/site"
import { getToday } from "@/lib/market"

export async function SiteFooter() {
  const year = (await getToday()).slice(0, 4)
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="container-page grid gap-6 py-8 text-muted-foreground md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-8">
        <p className="text-caption md:justify-self-start">
          © {year} {siteConfig.name}. Todos los derechos reservados.
        </p>
        <p className="max-w-md text-caption md:text-center">{siteConfig.description}</p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 md:justify-self-end">
          {siteConfig.nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
