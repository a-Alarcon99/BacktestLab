"use client"

import { useRef } from "react"
import { Popover } from "@base-ui/react/popover"
import { CircleHelpIcon } from "lucide-react"
import { cn } from "cn"
import type { Tone } from "@/lib/backtest-report"
import { useInView, useWidth } from "@/lib/motion"
import { useReplayText } from "../replay/format"

/**
 * A report section that plays its `.bt-*` animations once it scrolls into view (`.bt-armed`
 * until then). See the "Backtest report animations" block in globals.css.
 */
export function Reveal({
  children,
  className,
  label,
  as: Tag = "section",
}: {
  children: React.ReactNode
  className?: string
  label?: string
  as?: "section" | "div"
}) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, rootMargin: "0px 0px -8% 0px" })
  return (
    <Tag ref={ref as React.RefObject<never>} aria-label={label} className={cn(inView ? "bt-play" : "bt-armed", className)}>
      {children}
    </Tag>
  )
}

/** "?" button that explains a figure or a chart in plain words. */
export function InfoHint({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useReplayText()
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t(`¿Qué significa «${title}»?`, `What does “${title}” mean?`)}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted data-popup-open:text-foreground"
        data-print-hide
      >
        <CircleHelpIcon className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-[60]">
          <Popover.Popup className="w-72 max-w-[calc(100vw-2rem)] origin-[var(--transform-origin)] rounded-lg border bg-popover p-3 text-caption text-popover-foreground shadow-lg transition-[scale,opacity] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="mb-1 font-bold">{title}</Popover.Title>
            <Popover.Description render={<div />} className="flex flex-col gap-1.5 text-muted-foreground">
              {children}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export const toneText = (tone: Tone) => (tone === "good" ? "text-up" : tone === "bad" ? "text-down" : "text-chart-3")
export const toneBg = (tone: Tone) => (tone === "good" ? "bg-up" : tone === "bad" ? "bg-down" : "bg-chart-3")
export const toneSoft = (tone: Tone) => (tone === "good" ? "bg-up-soft" : tone === "bad" ? "bg-down-soft" : "bg-chart-3/15")

/** Card of one report chart: title, "how to read it" and the chart, which gets its width. */
export function ChartCard({
  title,
  reading,
  info,
  className,
  children,
  aside,
}: {
  title: string
  reading: string
  info?: React.ReactNode
  className?: string
  aside?: React.ReactNode
  children: (width: number) => React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  return (
    <Reveal className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4", className)} label={title}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex items-center gap-1.5 font-bold">
            {title}
            {info && <InfoHint title={title}>{info}</InfoHint>}
          </h3>
          <p className="text-caption text-muted-foreground">{reading}</p>
        </div>
        {aside}
      </header>
      <div ref={ref} className="min-w-0">
        {width > 0 && children(width)}
      </div>
    </Reveal>
  )
}

/** Small legend chip. */
export function Legend({ items }: { items: { label: string; className: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block h-2 w-3 rounded-sm", item.className, item.dashed && "h-0 border-t-2 border-dashed bg-transparent")} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
