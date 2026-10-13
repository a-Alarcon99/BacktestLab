import Link from "next/link"
import { siteConfig } from "@/config/site"

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="container-page flex flex-col gap-4 py-8 text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p className="max-w-md text-caption">{siteConfig.description}</p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
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
