import { cn } from "cn"

/** Circular asset icon. Falls back to a tinted monogram when there is no image. */
function AssetAvatar({
  symbol,
  src,
  size = 32,
  className,
}: {
  symbol: string
  src?: string
  size?: 24 | 32 | 40
  className?: string
}) {
  const sizes = { 24: "size-6 text-[10px]", 32: "size-8 text-xs", 40: "size-10 text-sm" }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-bold text-accent-foreground",
        sizes[size],
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote logos of unknown origin/size
        <img src={src} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        symbol.slice(0, 3).toUpperCase()
      )}
    </span>
  )
}

export { AssetAvatar }
