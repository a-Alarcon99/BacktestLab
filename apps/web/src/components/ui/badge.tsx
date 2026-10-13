import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-caption font-semibold whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        primary: "bg-accent text-accent-foreground",
        up: "bg-up-soft text-up",
        down: "bg-down-soft text-down",
        outline: "border border-border-strong text-muted-foreground",
      },
      shape: {
        default: "",
        pill: "rounded-full px-2.5",
      },
    },
    defaultVariants: { variant: "default", shape: "default" },
  }
)

function Badge({
  className,
  variant,
  shape,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, shape, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
