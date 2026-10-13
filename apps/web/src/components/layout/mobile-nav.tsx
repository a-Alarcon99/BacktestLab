"use client"

import { useState } from "react"
import Link from "next/link"
import { MenuIcon, XIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { siteConfig } from "@/config/site"

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <XIcon /> : <MenuIcon />}
      </Button>
      {open && (
        <div className="fixed inset-x-0 top-header bottom-0 z-40 overflow-y-auto border-t bg-background animate-in fade-in-0 slide-in-from-top-2">
          <nav className="container-page flex flex-col py-2">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex h-12 items-center border-b text-title font-semibold"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="container-page grid grid-cols-2 gap-3 py-4">
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Entrar
            </Link>
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Crear cuenta
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
