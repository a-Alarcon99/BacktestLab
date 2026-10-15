"use client"

import { createContext, useContext, useState } from "react"
import { cn } from "cn"
import { SearchIcon } from "lucide-react"
import { badgeVariants } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

/** `null` = all categories. */
const CategoryContext = createContext<{
  category: string | null
  setCategory: (category: string | null) => void
  query: string
  setQuery: (query: string) => void
}>({ category: null, setCategory: () => {}, query: "", setQuery: () => {} })

/**
 * Category + text filter state, shared by the pills, the search box and the items they filter. Items are rendered on the
 * server (live prices, inside <Suspense>) and only hidden here, so switching category is instant.
 */
function CategoryFilterProvider({ children }: { children: React.ReactNode }) {
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  return <CategoryContext value={{ category, setCategory, query, setQuery }}>{children}</CategoryContext>
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

/** Search box filtering the items by name or symbol. */
function CategoryFilterSearch({ className }: { className?: string }) {
  const { query, setQuery } = useContext(CategoryContext)
  return (
    <label className={cn("relative", className)}>
      <span className="sr-only">Buscar activo</span>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o símbolo"
        className="h-8 pl-9"
      />
    </label>
  )
}

/** List item hidden while another category is selected or it doesn't match the search text. */
function CategoryFilterItem({
  category,
  name,
  symbol,
  children,
}: {
  category: string
  name: string
  symbol: string
  children: React.ReactNode
}) {
  const { category: active, query } = useContext(CategoryContext)
  const needle = query.trim().toLowerCase()
  const matches = !needle || name.toLowerCase().includes(needle) || symbol.toLowerCase().includes(needle)
  return <li hidden={(active !== null && active !== category) || !matches}>{children}</li>
}

export { CategoryFilter, CategoryFilterItem, CategoryFilterProvider, CategoryFilterSearch }
