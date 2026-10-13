"use client"

import { useMemo, useState } from "react"
import { ChevronRightIcon } from "lucide-react"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { PriceChange } from "@/components/market/price-change"
import { Sparkline } from "@/components/market/sparkline"
import { Badge } from "@/components/ui/badge"
import type { BacktestRecord } from "@/lib/backtests"
import { formatDate } from "@/lib/format"
import { BacktestReplayDialog, type ReplayRun } from "./backtest-replay"

const decimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const oneDecimal = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// Shared by the column header and every row so the columns line up on large screens.
const rowGrid =
  "lg:grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(0,1fr))_auto] lg:items-center lg:gap-4 xl:grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(0,1fr))_7.5rem_auto]"

const columns = ["Rentabilidad", "Drawdown máx.", "Ratio de Sharpe", "Tasa de acierto", "Operaciones"]

/**
 * History of backtest runs, newest first. Each row re-runs that backtest (same strategy
 * snapshot) in the replay pop-up: stacked card on mobile, table-like row from `lg`.
 */
function BacktestList({ backtests }: { backtests: BacktestRecord[] }) {
  const [selected, setSelected] = useState<BacktestRecord | null>(null)
  const run = useMemo<ReplayRun | null>(
    () =>
      selected && {
        symbol: selected.symbol,
        strategy: selected.strategy,
        timeframe: selected.timeframe,
        from: selected.from,
        to: selected.to,
        mode: "review",
      },
    [selected]
  )
  return (
    <>
      <BacktestTable backtests={backtests} onOpen={setSelected} />
      {run && <BacktestReplayDialog open onOpenChange={(open) => !open && setSelected(null)} run={run} />}
    </>
  )
}

function BacktestTable({
  backtests,
  onOpen,
}: {
  backtests: BacktestRecord[]
  onOpen: (backtest: BacktestRecord) => void
}) {
  return (
    <section aria-label="Últimos backtests" className="overflow-hidden rounded-xl border bg-card text-card-foreground">
      <div
        aria-hidden
        className={`hidden border-b bg-muted/40 px-5 py-3 text-caption font-semibold text-muted-foreground lg:grid ${rowGrid}`}
      >
        <span>Backtest</span>
        {columns.map((column) => (
          <span key={column} className="text-right">
            {column}
          </span>
        ))}
        <span className="hidden text-right xl:block">Curva de capital</span>
        <span className="w-4" />
      </div>

      <ul className="divide-y">
        {backtests.map((backtest) => (
          <li key={backtest.id}>
            <BacktestRow backtest={backtest} onOpen={() => onOpen(backtest)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function BacktestRow({ backtest: b, onOpen }: { backtest: BacktestRecord; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`group grid w-full gap-4 text-left px-4 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset md:px-5 ${rowGrid}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AssetAvatar symbol={b.symbol} size={32} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{b.symbol}/USDT</span>
            <span className="truncate text-muted-foreground">{b.strategy.name}</span>
          </span>
          <span className="num flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
            <Badge variant="outline" className="h-5 px-1.5">
              {b.timeframe}
            </Badge>
            <span>
              {formatDate(b.from)} → {formatDate(b.to)}
            </span>
            <span aria-hidden>·</span>
            <span>Ejecutado el {formatDate(b.executedAt)}</span>
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:contents">
        <Metric label={columns[0]}>
          <PriceChange value={b.stats.returnPct} variant="pill" />
        </Metric>
        <Metric label={columns[1]}>
          <span className="num font-semibold">−{decimal.format(Math.abs(b.stats.maxDrawdownPct))}%</span>
        </Metric>
        <Metric label={columns[2]}>
          <span className="num font-semibold">{decimal.format(b.stats.sharpe)}</span>
        </Metric>
        <Metric label={columns[3]}>
          <span className="num font-semibold">{oneDecimal.format(b.stats.winRatePct)}%</span>
        </Metric>
        <Metric label={columns[4]}>
          <span className="num font-semibold">{b.stats.trades}</span>
        </Metric>
      </dl>

      <Sparkline values={b.equity} width={120} height={32} className="ml-auto hidden xl:block" />
      <ChevronRightIcon
        aria-hidden
        className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground lg:block"
      />
    </button>
  )
}

/** Label above the value on small screens; on `lg` the column header carries the label. */
function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 lg:items-end">
      <dt className="text-caption text-muted-foreground lg:sr-only">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export { BacktestList }
