"use client"

import { useLayoutEffect } from "react"
import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  // In development Strict Mode remounts <html> and drops the class set by ThemeScript; re-apply it
  // before paint. No-op in production.
  useLayoutEffect(() => {
    try {
      const t = localStorage.getItem("theme")
      const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
      document.documentElement.classList.toggle("dark", dark)
    } catch {}
  }, [])

  function toggle() {
    const dark = document.documentElement.classList.toggle("dark")
    try {
      localStorage.setItem("theme", dark ? "dark" : "light")
    } catch {}
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar tema">
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  )
}
