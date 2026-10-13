import { cn } from "cn"

/** Label/value rows separated by hairlines — the default way to show metrics. */
function StatList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; hint?: React.ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn("divide-y", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-4 py-3">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="num flex flex-col items-end text-right font-semibold">
            {item.value}
            {item.hint && (
              <span className="text-caption font-normal text-muted-foreground">{item.hint}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export { StatList }
