"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type TocItem = { id: string; label: string }

/** Index of the page: links to the sections and highlights the one being read. */
export function DocsToc({ items, label }: { items: TocItem[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id)

  useEffect(() => {
    const sections = items.map((item) => document.getElementById(item.id)).filter((el) => el !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length) setActive(visible[0].target.id)
      },
      { rootMargin: "-15% 0px -70% 0px" }
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label={label} className="flex flex-col gap-2">
      <p className="px-3 text-caption font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <ol className="flex flex-col gap-0.5">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "flex gap-2.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-muted hover:text-foreground",
                active === item.id ? "bg-muted font-semibold text-primary" : "text-muted-foreground"
              )}
            >
              <span className="num text-caption leading-6 opacity-70">{i + 1}</span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
