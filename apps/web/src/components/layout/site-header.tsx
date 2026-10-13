import Link from "next/link"
import { ActivityIcon, SearchIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { siteConfig } from "@/config/site"
import { MobileNav } from "./mobile-nav"
import { ThemeToggle } from "./theme-toggle"

/**
 * Sticky top bar: brand + primary nav on the left, search + session actions on the right.
 * Below `lg` the nav collapses into a full-screen menu; below `md` search becomes an icon.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 h-header border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="container-page flex h-full items-center gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-title font-bold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ActivityIcon className="size-4.5" />
          </span>
          {siteConfig.name}
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 font-semibold transition-colors hover:bg-muted hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden h-9 w-56 items-center gap-2 rounded-lg bg-muted px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/40 md:flex xl:w-64">
            <SearchIcon className="size-4 shrink-0" />
            <input
              type="search"
              placeholder="Buscar activo o estrategia"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <Link
            href="/search"
            aria-label="Buscar"
            className={buttonVariants({ variant: "ghost", size: "icon", className: "md:hidden" })}
          >
            <SearchIcon />
          </Link>
          <ThemeToggle />
          <div className="hidden items-center gap-2 lg:flex">
            <Link href="/login" className={buttonVariants({ variant: "outline" })}>
              Entrar
            </Link>
            <Link href="/signup" className={buttonVariants()}>
              Crear cuenta
            </Link>
          </div>
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
