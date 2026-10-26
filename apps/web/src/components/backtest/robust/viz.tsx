"use client"

import { useId } from "react"
import { cn } from "cn"
import type { Tone } from "@/lib/backtest-report"
import { clamp, easeOutCubic } from "@/lib/chart-geometry"
import { toneSoft, toneText } from "../report/parts"
import { Hint } from "./hover"

// Building blocks of the robustness and multi-asset animations: gradients and glow for the SVG
// charts, a ring gauge, stat tiles that hold their figures, tags and pulses. Everything here is a
// pure function of its props (the animations pass values worked out from the playback position).

/** An id that is safe inside `url(#…)`. */
export const useSvgId = () => useId().replace(/[^a-zA-Z0-9_-]/g, "")

/** CSS colour of a tone. Gain and loss colours are only used for what is a gain or a loss. */
export const toneVar = (tone: Tone) => (tone === "good" ? "var(--up)" : tone === "bad" ? "var(--down)" : "var(--chart-3)")

/** Colour of a return: gain, loss, or neutral for none yet. */
export const signVar = (value: number | null) => (value === null ? "var(--muted-foreground)" : value >= 0 ? "var(--up)" : "var(--down)")

/**
 * Gradients (`<id>-primary|up|down|ink`, fading to nothing downwards) and a soft glow
 * (`<id>-glow`) for the charts of one SVG. Put it first inside the `<svg>`.
 */
export function VizDefs({ id }: { id: string }) {
  const fade = (name: string, colour: string, from = 0.32, flip = false) => (
    <linearGradient key={name} id={`${id}-${name}`} x1="0" y1={flip ? 1 : 0} x2="0" y2={flip ? 0 : 1}>
      <stop offset="0" stopColor={colour} stopOpacity={from} />
      <stop offset="1" stopColor={colour} stopOpacity={0} />
    </linearGradient>
  )
  return (
    <defs>
      {fade("primary", "var(--primary)")}
      {fade("up", "var(--up)")}
      {fade("down", "var(--down)")}
      {fade("down-flip", "var(--down)", 0.32, true)}
      {fade("ink", "var(--foreground)", 0.12)}
      <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

export const paint = (id: string, name: "primary" | "up" | "down" | "down-flip" | "ink") => `url(#${id}-${name})`
export const glow = (id: string) => `url(#${id}-glow)`

/** Triangle of half-width `size` centred on (x, y): up for a buy, down for a sell. */
export const trianglePath = (x: number, y: number, size: number, up: boolean) =>
  up ? `M${x} ${y - size}L${x + size} ${y + size * 0.8}L${x - size} ${y + size * 0.8}Z` : `M${x} ${y + size}L${x + size} ${y - size * 0.8}L${x - size} ${y - size * 0.8}Z`

/** A small rounded label on an SVG chart (its width is estimated from the text). */
export function Tag({ x, y, text, colour = "var(--foreground)", anchor = "middle", size = 11 }: { x: number; y: number; text: string; colour?: string; anchor?: "start" | "middle" | "end"; size?: number }) {
  const w = text.length * size * 0.6 + 14
  const h = size + 9
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - h / 2} width={w} height={h} rx={h / 2} fill={colour} />
      <text x={left + w / 2} y={y + size * 0.35} textAnchor="middle" fontSize={size} fontWeight={700} fill="var(--background)" className="num">
        {text}
      </text>
    </g>
  )
}

/**
 * A ring that expands and fades around (x, y) for `span` units of `age` after something happens:
 * a window closing, a variant landing. Nothing before it happens or once it is over.
 */
export function Pulse({ x, y, age, span = 18, colour, from = 4, to = 24 }: { x: number; y: number; age: number; span?: number; colour: string; from?: number; to?: number }) {
  if (age <= 0 || age >= span) return null
  const u = easeOutCubic(age / span)
  return <circle cx={x} cy={y} r={from + (to - from) * u} fill="none" stroke={colour} strokeWidth={2.2 * (1 - u) + 0.4} opacity={1 - u} pointerEvents="none" />
}

/** Ring gauge of a share (0-1), with the figure in the middle. */
export function Ring({ value, tone, size = 84, children, label }: { value: number; tone: Tone; size?: number; children?: React.ReactNode; label: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const v = clamp(value)
  const angle = v * Math.PI * 2 - Math.PI / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 80 80" className="size-full">
        <circle cx={40} cy={40} r={r} fill="none" stroke="var(--muted)" strokeWidth={7} />
        <circle cx={40} cy={40} r={r} fill="none" stroke={toneVar(tone)} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 40 40)" />
        {v > 0.02 && <circle cx={40 + r * Math.cos(angle)} cy={40 + r * Math.sin(angle)} r={3} fill="var(--background)" opacity={0.9} />}
      </svg>
      <span className={cn("num absolute inset-0 flex flex-col items-center justify-center leading-none font-bold", toneText(tone))}>{children}</span>
    </div>
  )
}

/**
 * A figure with its label, an optional line below and an optional meter (0-1). Fixed height, so it
 * never makes a panel jump. `hint` adds a "?" with the longer explanation of the figure.
 */
export function StatTile({ label, value, sub, tone, meter, hint, className }: { label: string; value: string; sub?: string; tone?: Tone; meter?: number; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-lg p-3", tone ? toneSoft(tone) : "bg-muted/50", className)}>
      <dt className="flex min-h-5 min-w-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        {hint && <Hint title={label}>{hint}</Hint>}
      </dt>
      <dd className={cn("num text-title leading-tight font-bold", tone && toneText(tone))}>{value}</dd>
      <dd className="num min-h-[1em] truncate text-[11px] text-muted-foreground">{sub ?? " "}</dd>
      {meter !== undefined && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-foreground/5">
          <span className="block h-full rounded-r-full" style={{ width: `${clamp(meter) * 100}%`, background: tone ? toneVar(tone) : "var(--primary)" }} />
        </span>
      )}
    </div>
  )
}

/** Titled block of a chart: heading, one-line explanation, optional "?" and optional controls on the right. */
export function VizPanel({ title, text, hint, right, children, className }: { title: string; text?: string; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <header className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-bold">
            {title}
            {hint && <Hint title={title}>{hint}</Hint>}
          </h3>
          {text && <p className="text-[11px] text-muted-foreground">{text}</p>}
        </div>
        {right}
      </header>
      {children}
    </div>
  )
}

/** One sentence that says what is happening right now (so the animation can be followed without knowing the test). */
export function Narration({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex min-h-10 items-center gap-2.5 rounded-lg bg-accent/60 px-3 py-2 text-caption text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0" aria-live="off">
      {icon}
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/**
 * "Reading the results": a few short sentences that put the figures into words, and the key terms
 * of the test, each with its longer explanation behind a "?".
 */
export function ReadingPanel({ title, lines, terms, label }: { title: string; lines: React.ReactNode[]; terms?: { term: string; text: string; more?: string }[]; label: string }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="font-bold">{title}</h3>
      <div className="flex flex-col gap-2 text-caption leading-relaxed text-foreground/90">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {terms && terms.length > 0 && (
        <dl className="grid gap-2 border-t pt-3 sm:grid-cols-2">
          {terms.map((item) => (
            <div key={item.term} className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2">
              <dt className="flex items-center gap-1 text-caption font-semibold">
                {item.term}
                {item.more && <Hint title={item.term}>{item.more}</Hint>}
              </dt>
              <dd className="text-[11px] leading-snug text-muted-foreground">{item.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

/** Legend row: colour swatches (or dashes) and their meaning. */
export function LegendRow({ items }: { items: { label: string; colour: string; dashed?: boolean; dot?: boolean }[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          {item.dot ? (
            <span className="size-2.5 rounded-full" style={{ background: item.colour }} />
          ) : (
            <span className="h-0 w-4 border-t-2" style={{ borderColor: item.colour, borderStyle: item.dashed ? "dashed" : "solid" }} />
          )}
          {item.label}
        </span>
      ))}
    </p>
  )
}

/**
 * Moves labels apart so that neighbours are at least `gap` high, keeping their order and staying
 * inside [lo, hi]. Returns the new y of each input, in the input order.
 */
export function spreadOut(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i)
  const out = order.map(({ y }) => clamp(y, lo, hi))
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + gap)
  if (out.length && out[out.length - 1] > hi) {
    out[out.length - 1] = hi
    for (let k = out.length - 2; k >= 0; k--) out[k] = Math.min(out[k], out[k + 1] - gap)
  }
  const result = new Array<number>(ys.length)
  order.forEach(({ i }, k) => (result[i] = out[k]))
  return result
}
