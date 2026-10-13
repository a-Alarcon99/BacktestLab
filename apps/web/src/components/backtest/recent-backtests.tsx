"use client"

import Link from "next/link"
import { HistoryIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { useRecentBacktests } from "@/lib/storage/backtests"
import { BacktestList } from "./backtest-list"

/** The user's last runs, read from this browser. */
function RecentBacktests() {
  const { data: backtests } = useRecentBacktests()

  if (!backtests) return <div aria-hidden className="h-96 animate-pulse rounded-xl bg-muted/40" />
  if (backtests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <HistoryIcon className="size-5" />
        </span>
        <p className="font-semibold">Aún no has ejecutado backtests</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          Elige un activo o una de tus estrategias y ejecuta un backtest: aparecerá aquí para que puedas revisarlo.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Ver activos
          </Link>
          <Link href="/strategies" className={buttonVariants()}>
            Mis estrategias
          </Link>
        </div>
      </div>
    )
  }
  return <BacktestList backtests={backtests} />
}

export { RecentBacktests }
