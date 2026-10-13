import { TriangleIcon } from "lucide-react"
import { cn } from "cn"

const percent = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Signed percentage, colored by direction. `value` is a percentage (2.5 = +2.50%). */
function PriceChange({
  value,
  variant = "text",
  className,
}: {
  value: number
  variant?: "text" | "pill"
  className?: string
}) {
  const up = value >= 0
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 font-semibold",
        up ? "text-up" : "text-down",
        variant === "pill" &&
          (up ? "bg-up-soft" : "bg-down-soft") + " h-7 rounded-md px-2",
        className
      )}
    >
      <TriangleIcon
        aria-hidden
        className={cn("size-2.5 fill-current", !up && "rotate-180")}
      />
      <span className="sr-only">{up ? "Sube" : "Baja"}</span>
      {percent.format(Math.abs(value))}%
    </span>
  )
}

export { PriceChange }
