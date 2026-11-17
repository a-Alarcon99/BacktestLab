import type { ReactNode, Ref } from "react"

// Pieces shared by the animated figures of the docs page (no hooks: usable from client files).

/** Card around an SVG figure, with a caption that says what it shows and that it is an example. */
export function ArtFrame({ caption, children, ref }: { caption: ReactNode; children: ReactNode; ref?: Ref<HTMLElement> }) {
  return (
    <figure ref={ref} className="flex flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="p-3 sm:p-5">{children}</div>
      <figcaption className="border-t bg-muted/30 px-4 py-3 text-caption text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

/** Rounded label inside an SVG, centred on `x` (or ending/starting there with `anchor`). */
export function Chip({
  x,
  y,
  text,
  color = "var(--foreground)",
  alpha = 1,
  size = 12,
  anchor = "middle",
  filled = false,
}: {
  x: number
  y: number
  text: string
  color?: string
  alpha?: number
  size?: number
  anchor?: "start" | "middle" | "end"
  filled?: boolean
}) {
  if (alpha <= 0) return null
  const w = text.length * size * 0.56 + 18
  const h = size + 11
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x
  return (
    <g opacity={alpha}>
      <rect
        x={left}
        y={y - h / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill={filled ? color : "var(--popover)"}
        stroke={filled ? "none" : color}
        strokeWidth={1.2}
      />
      <text
        x={left + w / 2}
        y={y + size * 0.36}
        textAnchor="middle"
        fontSize={size}
        fontWeight={600}
        fill={filled ? "var(--primary-foreground)" : color}
      >
        {text}
      </text>
    </g>
  )
}

/** Distance (<= 0, in %) below the running peak at every point of a curve. */
export function drawdownOf(values: number[]) {
  let peak = values[0]
  return values.map((v) => {
    peak = Math.max(peak, v)
    return (v / peak - 1) * 100
  })
}
