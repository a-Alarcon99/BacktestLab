import { cn } from "cn"

/**
 * Options on a muted track; the active one is raised on the background color.
 * Controlled: pass `onValueChange` (from a client component) to make it interactive;
 * without it the control is presentational. `labels` overrides the text shown per option.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  labels,
  size = "default",
  label,
  className,
}: {
  options: readonly T[]
  value: T
  onValueChange?: (value: T) => void
  labels?: Partial<Record<T, React.ReactNode>>
  size?: "sm" | "default"
  label: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none]",
        className
      )}
    >
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={onValueChange && (() => onValueChange(option))}
            className={cn(
              "num inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              size === "sm" ? "h-7 px-2.5 text-caption" : "h-9 min-w-11 flex-1 px-3",
              active
                ? "bg-background text-foreground shadow-sm dark:bg-card"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {labels?.[option] ?? option}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
