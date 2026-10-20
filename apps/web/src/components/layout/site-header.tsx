import Link from "next/link"
import { ActivityIcon } from "lucide-react"
import { siteConfig } from "@/config/site"
import { getI18n } from "@/lib/i18n-server"
import { CurrencySwitcher } from "./currency-switcher"
import { LanguageSwitcher } from "./language-switcher"
import { MobileNav } from "./mobile-nav"
import { ThemeToggle } from "./theme-toggle"
import { UserMenu } from "./user-menu"

/**
 * Sticky top bar: brand + primary nav on the left, session actions on the right.
 * Below `lg` the nav collapses into a full-screen menu.
 */
export async function SiteHeader() {
  const { locale, href } = await getI18n()
  return (
    <header className="sticky top-0 z-50 h-header border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="container-page flex h-full items-center gap-6">
        <Link href={href("/")} className="flex shrink-0 items-center gap-2 text-title font-bold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ActivityIcon className="size-4.5" />
          </span>
          {siteConfig.name}
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={href(item.href)}
              className="rounded-md px-3 py-2 font-semibold transition-colors hover:bg-muted hover:text-primary"
            >
              {item.label[locale]}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <CurrencySwitcher className="hidden sm:inline-flex" />
          <ThemeToggle />
          <div className="hidden lg:block">
            <UserMenu />
          </div>
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
