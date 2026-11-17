"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { MenuIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/i18n/locale-provider"
import { siteConfig } from "@/config/site"
import { CurrencySwitcher } from "./currency-switcher"
import { LanguageSwitcher } from "./language-switcher"
import { UserMenu } from "./user-menu"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { locale, t, href } = useI18n()

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? t("Cerrar menú", "Close menu") : t("Abrir menú", "Open menu")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <XIcon /> : <MenuIcon />}
      </Button>
      {open &&
        // Portal: the header's backdrop-filter would otherwise become the
        // containing block of this fixed panel and collapse it to the header height.
        createPortal(
          <div className="fixed inset-x-0 top-header bottom-0 z-40 overflow-y-auto border-t bg-background animate-in fade-in-0 slide-in-from-top-2">
            <nav className="container-page flex flex-col py-2">
              {siteConfig.nav.map((item) => (
                <Link
                  key={item.href}
                  href={href(item.href)}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center border-b text-title font-semibold"
                >
                  {item.label[locale]}
                </Link>
              ))}
            </nav>
            <div className="container-page flex gap-2 pt-4 sm:hidden">
              <LanguageSwitcher />
              <CurrencySwitcher />
            </div>
            {/* Only links and sign-out close the panel: the account menu and its pop-up are portaled children. */}
            <div
              className="container-page py-4"
              onClick={(e) => (e.target as HTMLElement).closest("a, [data-close-menu]") && setOpen(false)}
            >
              <UserMenu stacked />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
