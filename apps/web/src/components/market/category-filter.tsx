"use client"

import { createContext, useContext, useState } from "react"
import { cn } from "cn"
import { badgeVariants } from "@/components/ui/badge"

/** `null` = all categories. */
const CategoryContext = createContext<{
  category: string | null
  setCategory: (category: string | null) => void
}>({ category: null, setCategory: () => {} })

/**
 * Category filter state, shared by the pills and the items they filter. Items are rendered on the
 * server (live prices, inside <Suspense>) and only hidden here, so switching category is instant.
 */
function CategoryFilterProvider({ children }: { children: React.ReactNode }) {
  const [category, setCategory] = useState<string | null>(null)
  return <CategoryContext value={{ category, setCategory }}>{children}</CategoryContext>
}

function CategoryFilter({ categories, className }: { categories: string[]; className?: string }) {
  const { category: active, setCategory } = useContext(CategoryContext)
  const options = [{ label: "Todos", value: null }, ...categories.map((c) => ({ label: c, value: c }))]

  return (
    <div role="group" aria-label="Categoría" className={className}>
      {options.map(({ label, value }) => {
        const pressed = value === active
        return (
          <button
            key={label}
            type="button"
            aria-pressed={pressed}
            onClick={() => setCategory(value)}
            className={cn(
              badgeVariants({ shape: "pill", variant: pressed ? "primary" : "default" }),
              "h-8 cursor-pointer px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              !pressed && "hover:text-foreground"
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** List item hidden while another category is selected. */
function CategoryFilterItem({ category, children }: { category: string; children: React.ReactNode }) {
  const { category: active } = useContext(CategoryContext)
  return <li hidden={active !== null && active !== category}>{children}</li>
}

export { CategoryFilter, CategoryFilterItem, CategoryFilterProvider }
