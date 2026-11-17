import type { ReactNode } from "react"
import { InfoIcon, LightbulbIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Building blocks of the docs page: a section with an anchor, running text, callouts and tables.

export function DocSection({ id, kicker, title, lead, children }: { id: string; kicker: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="text-caption font-semibold tracking-wide text-primary uppercase">{kicker}</span>
        <h2 id={`${id}-title`} className="text-section font-bold tracking-tight text-balance lg:text-[2rem] lg:leading-[2.5rem]">
          {title}
        </h2>
        {lead && <p className="text-lead text-pretty text-muted-foreground">{lead}</p>}
      </header>
      {children}
    </section>
  )
}

/** Sub-heading with its own anchor, followed by running text. */
export function DocPart({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="flex flex-col gap-3">
      <h3 className="text-title font-bold tracking-tight">{title}</h3>
      <Prose>{children}</Prose>
    </div>
  )
}

/** Running text: muted paragraphs, bold = emphasis, lists and inline code styled in one place. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 text-muted-foreground [&_a]:font-semibold [&_a]:text-primary [&_a]:hover:underline [&_li]:pl-1 [&_ol]:ml-5 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_strong]:text-foreground [&_ul]:ml-5 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2",
        className
      )}
    >
      {children}
    </div>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-muted px-1.5 py-0.5 text-[0.9em] font-medium text-foreground">{children}</code>
}

export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-b-2 bg-muted px-1.5 py-0.5 text-caption font-semibold text-foreground">{children}</kbd>
  )
}

const callouts = {
  tip: { Icon: LightbulbIcon, tone: "border-chart-2/40 bg-chart-2/10", icon: "text-chart-2" },
  note: { Icon: InfoIcon, tone: "border-primary/30 bg-primary/5", icon: "text-primary" },
  warning: { Icon: TriangleAlertIcon, tone: "border-chart-3/40 bg-chart-3/10", icon: "text-chart-3" },
} as const

/** Highlighted box: a tip, a side note or a warning. */
export function Callout({ kind = "note", title, children }: { kind?: keyof typeof callouts; title: string; children: ReactNode }) {
  const { Icon, tone, icon } = callouts[kind]
  return (
    <aside className={cn("flex gap-3 rounded-2xl border px-4 py-3.5", tone)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", icon)} aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-foreground">{title}</p>
        <div className="flex flex-col gap-2 text-muted-foreground [&_a]:font-semibold [&_a]:text-primary [&_a]:hover:underline [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </aside>
  )
}

/** Simple table that scrolls sideways on narrow screens. */
export function DocTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[40rem] text-left">
        <thead className="bg-muted/50 text-caption font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-4 py-2.5">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t align-top">
              {row.map((cell, j) => (
                <td key={j} className={cn("px-4 py-3 text-muted-foreground", j === 0 && "font-semibold whitespace-nowrap text-foreground")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Terms and meanings, one per row. */
export function Glossary({ items }: { items: { term: string; meaning: ReactNode }[] }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-[minmax(9rem,12rem)_1fr]">
      {items.map(({ term, meaning }) => (
        <div key={term} className="contents">
          <dt className="bg-muted/40 px-4 py-3 font-semibold text-foreground sm:py-3.5">{term}</dt>
          <dd className="bg-card px-4 pb-3 text-muted-foreground sm:py-3.5">{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}
