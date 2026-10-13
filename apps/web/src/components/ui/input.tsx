import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

const fieldBase =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-body transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50 dark:bg-input/20"

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldBase, "num", className)} {...props} />
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(fieldBase, "appearance-none pr-9", className)}
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/** Label + control + optional hint, stacked. */
function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-caption font-semibold text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  )
}

export { Input, Select, Field }
