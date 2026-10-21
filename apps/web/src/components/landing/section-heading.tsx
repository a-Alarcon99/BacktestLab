import { cn } from "@/lib/utils"

/** Kicker + title + lead of a landing section. */
function SectionHeading({
  kicker,
  title,
  lead,
  align = "left",
  id,
}: {
  kicker: string
  title: React.ReactNode
  lead?: React.ReactNode
  align?: "left" | "center"
  id?: string
}) {
  return (
    <div className={cn("flex max-w-3xl flex-col gap-3", align === "center" && "mx-auto items-center text-center")}>
      <span className="text-caption font-semibold tracking-wide text-primary uppercase">{kicker}</span>
      <h2 id={id} className="text-section font-bold tracking-tight text-balance lg:text-[2.25rem] lg:leading-[2.75rem]">
        {title}
      </h2>
      {lead && <p className="text-lead text-pretty text-muted-foreground">{lead}</p>}
    </div>
  )
}

export { SectionHeading }
