"use client"

import { useState } from "react"
import { cn } from "cn"

/**
 * Circular asset icon. By convention the image is `public/crypto/<symbol>.png`; when that file
 * does not exist it falls back to a tinted monogram (never both: icons may be transparent).
 */
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
  const [failed, setFailed] = useState(false)
  const sizes = { 24: "size-6 text-[10px]", 32: "size-8 text-xs", 40: "size-10 text-sm" }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-bold text-accent-foreground",
        sizes[size],
        className
      )}
    >
      {failed ? (
        symbol.slice(0, 3).toUpperCase()
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static icons, no optimization needed
        <img
          // The error can fire before hydration attaches `onError`: check the finished load too.
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0) setFailed(true)
          }}
          src={src ?? `/crypto/${symbol.toLowerCase()}.png`}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </span>
  )
}

export { AssetAvatar }
