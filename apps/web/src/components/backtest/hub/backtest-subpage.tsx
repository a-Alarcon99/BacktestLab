import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { PlanUsage } from "@/components/plan/plan-usage"
import { getI18n } from "@/lib/i18n-server"

/** Frame of the pages the hub cards open: back link, title, the plan's usage and the content. */
export async function BacktestSubpage({ title, text, children, usage = true }: { title: string; text: string; children: React.ReactNode; usage?: boolean }) {
  const { t, href } = await getI18n()
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <section className="flex flex-col gap-2">
        <Link href={href("/backtests")} className="inline-flex items-center gap-1.5 self-start text-caption font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" />
          {t("Todos los backtests", "All backtests")}
        </Link>
        <h1>{title}</h1>
        <p className="max-w-2xl text-muted-foreground">{text}</p>
      </section>
      {children}
      {usage && <PlanUsage />}
    </div>
  )
}
