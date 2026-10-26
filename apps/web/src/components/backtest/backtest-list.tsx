"use client"

import { useMemo, useState } from "react"
import { ChevronRightIcon, Trash2Icon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { PriceChange } from "@/components/market/price-change"
import { Sparkline } from "@/components/market/sparkline"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "cn"
import { isBatchRecord, isRobustRecord, requestOfRobust, type BacktestRecord, type BatchRecord, type HistoryRecord, type RobustRecord } from "@/lib/backtests"
import { formatDate, numberFormat } from "@/lib/format"
import type { Translate } from "@/lib/i18n"
import { deleteBacktest } from "@/lib/storage/backtests"
import { BacktestReplayDialog, type ReplayRun } from "./backtest-replay"
import { MultiReplayDialog, type MultiRun } from "./multi/multi-replay"
import { RobustReplayDialog, type RobustRun } from "./robust/robust-replay"
import { toneSoft, toneText } from "./report/parts"
import { testMeta } from "./robust/test-meta"


// Shared by the column header and every row so the columns line up on large screens.
const rowGrid =
  "lg:grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(0,1fr))_auto] lg:items-center lg:gap-4 lg:pr-14 xl:grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(0,1fr))_7.5rem_auto]"

const columnsOf = (t: Translate) => [
  t("Rentabilidad", "Return"),
  t("Drawdown máx.", "Max drawdown"),
  t("Ratio de Sharpe", "Sharpe ratio"),
  t("Tasa de acierto", "Win rate"),
  t("Operaciones", "Trades"),
]

/**
 * History of backtest runs, newest first. Each row re-runs that backtest (same strategy
 * snapshot) in the replay pop-up: stacked card on mobile, table-like row from `lg`.
 */
function BacktestList({ backtests }: { backtests: HistoryRecord[] }) {
  const [selected, setSelected] = useState<HistoryRecord | null>(null)
  const [deleting, setDeleting] = useState<HistoryRecord | null>(null)
  const { t } = useI18n()
  const run = useMemo<ReplayRun | null>(
    () =>
      selected && !isBatchRecord(selected) && !isRobustRecord(selected)
        ? {
            symbol: selected.symbol,
            strategy: selected.strategy,
            timeframe: selected.timeframe,
            from: selected.from,
            to: selected.to,
            mode: "review",
            recordId: selected.id,
          }
        : null,
    [selected]
  )
  // Reopening a group re-runs the batch; it is free because the server recognizes its digest.
  const batchRun = useMemo<MultiRun | null>(
    () =>
      selected && isBatchRecord(selected)
        ? { kind: "assets", symbols: selected.symbols, strategy: selected.strategy, timeframe: selected.timeframe, from: selected.from, to: selected.to, mode: "review" }
        : null,
    [selected]
  )
  // Same for a robustness test.
  const robustRun = useMemo<RobustRun | null>(() => (selected && isRobustRecord(selected) ? { ...requestOfRobust(selected), mode: "review" } : null), [selected])
  return (
    <>
      <BacktestTable backtests={backtests} onOpen={setSelected} onDelete={setDeleting} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("Eliminar backtest", "Delete backtest")}
        description={
          deleting &&
          (() => {
            const what = isBatchRecord(deleting) ? t(`${deleting.symbols.length} activos`, `${deleting.symbols.length} assets`) : isRobustRecord(deleting) ? `${testMeta(deleting.test, t).title} · ${deleting.symbol}/USDT` : `${deleting.symbol}/USDT`
            return t(
              `${what} · ${deleting.strategy.name}. Se quitará del historial y no se puede deshacer.`,
              `${what} · ${deleting.strategy.name}. It will be removed from the history and can't be undone.`
            )
          })()
        }
        onConfirm={() => deleting && void deleteBacktest(deleting.id)}
      />
      {run && <BacktestReplayDialog open onOpenChange={(open) => !open && setSelected(null)} run={run} />}
      {batchRun && <MultiReplayDialog open onOpenChange={(open) => !open && setSelected(null)} run={batchRun} />}
      {robustRun && <RobustReplayDialog open onOpenChange={(open) => !open && setSelected(null)} run={robustRun} />}
    </>
  )
}

function BacktestTable({
  backtests,
  onOpen,
  onDelete,
}: {
  backtests: HistoryRecord[]
  onOpen: (backtest: HistoryRecord) => void
  onDelete: (backtest: HistoryRecord) => void
}) {
  const { t } = useI18n()
  const columns = columnsOf(t)
  return (
    <section aria-label={t("Últimos backtests", "Latest backtests")} className="overflow-hidden rounded-xl border bg-card text-card-foreground">
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
        <span className="hidden text-right xl:block">{t("Curva de capital", "Equity curve")}</span>
        <span className="w-4" />
      </div>

      <ul className="divide-y">
        {backtests.map((backtest) => (
          <li key={backtest.id} className="relative">
            {isRobustRecord(backtest) ? (
              <RobustRow backtest={backtest} onOpen={() => onOpen(backtest)} />
            ) : isBatchRecord(backtest) ? (
              <BatchRow backtest={backtest} onOpen={() => onOpen(backtest)} />
            ) : (
              <BacktestRow backtest={backtest} onOpen={() => onOpen(backtest)} />
            )}
            <button
              type="button"
              aria-label={
                isRobustRecord(backtest)
                  ? t(`Eliminar prueba de robustez de ${backtest.symbol}/USDT con ${backtest.strategy.name}`, `Delete robustness test of ${backtest.symbol}/USDT with ${backtest.strategy.name}`)
                  : isBatchRecord(backtest)
                  ? t(
                      `Eliminar backtest de ${backtest.symbols.length} activos con ${backtest.strategy.name}`,
                      `Delete backtest of ${backtest.symbols.length} assets with ${backtest.strategy.name}`
                    )
                  : t(
                      `Eliminar backtest de ${backtest.symbol}/USDT con ${backtest.strategy.name}`,
                      `Delete backtest of ${backtest.symbol}/USDT with ${backtest.strategy.name}`
                    )
              }
              title={t("Eliminar del historial", "Remove from history")}
              onClick={() => onDelete(backtest)}
              className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-down-soft hover:text-down focus-visible:ring-3 focus-visible:ring-ring/30 lg:top-1/2 lg:right-4 lg:-translate-y-1/2"
            >
              <Trash2Icon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BacktestRow({ backtest: b, onOpen }: { backtest: BacktestRecord; onOpen: () => void }) {
  const { locale, t } = useI18n()
  const columns = columnsOf(t)
  const decimal = numberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const oneDecimal = numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`group grid w-full gap-4 text-left px-4 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset md:px-5 ${rowGrid}`}
    >
      <div className="flex min-w-0 items-center gap-3 pr-10 lg:pr-0">
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
              {formatDate(b.from, locale)} → {formatDate(b.to, locale)}
            </span>
            <span aria-hidden>·</span>
            <span>
              {t("Ejecutado el", "Run on")} {formatDate(b.executedAt, locale)}
            </span>
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:contents">
        <Metric label={columns[0]}>
          <PriceChange value={b.stats.returnPct} variant="pill" locale={locale} />
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

/** Text of a robustness verdict for the list (see `robustness-report.ts` for the codes). */
function headlineShort(test: RobustRecord["test"], headline: string, t: Translate): string {
  const table: Record<string, [string, string]> = {
    none: ["Sin resultado", "No result"],
    consistent: ["Consistente", "Consistent"],
    uneven: ["Desigual", "Uneven"],
    fragile: ["Frágil", "Fragile"],
    loses: ["Pierde", "Loses"],
    plateau: ["Meseta", "Plateau"],
    peak: ["Pico aislado", "Isolated peak"],
    mixed: ["Moderada", "Moderate"],
    weak: ["Débil", "Weak"],
    lonely: ["Solo esta temporalidad", "This timeframe only"],
  }
  const [es, en] = table[headline] ?? [headline, headline]
  return test === "sensitivity" && headline === "mixed" ? t("Sensibilidad moderada", "Moderate sensitivity") : t(es, en)
}

/** A robustness test (rolling windows, sensitivity, neighbouring timeframes): one row with its score. */
function RobustRow({ backtest: b, onOpen }: { backtest: RobustRecord; onOpen: () => void }) {
  const { locale, t } = useI18n()
  const columns = columnsOf(t)
  const meta = testMeta(b.test, t)
  const unit = b.test === "windows" ? t("ventanas rentables", "profitable windows") : b.test === "sensitivity" ? t("variantes rentables", "profitable variants") : t("temporalidades rentables", "profitable timeframes")
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`group grid w-full gap-4 text-left px-4 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset md:px-5 ${rowGrid}`}
    >
      <div className="flex min-w-0 items-center gap-3 pr-10 lg:pr-0">
        <span className="relative shrink-0" aria-hidden>
          <AssetAvatar symbol={b.symbol} size={32} />
          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card [&_svg]:size-2.5">{meta.icon}</span>
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{meta.title}</span>
            <span className="truncate text-muted-foreground">
              {b.symbol}/USDT · {b.strategy.name}
            </span>
          </span>
          <span className="num flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
            <Badge variant="outline" className="h-5 px-1.5">
              {b.timeframe}
            </Badge>
            <span>
              {formatDate(b.from, locale)} → {formatDate(b.to, locale)}
            </span>
            {b.options.lengthDays && (
              <>
                <span aria-hidden>·</span>
                <span>{t(`ventanas de ${b.options.lengthDays} d cada ${b.options.stepDays} d`, `${b.options.lengthDays} d windows every ${b.options.stepDays} d`)}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>
              {t("Ejecutado el", "Run on")} {formatDate(b.executedAt, locale)}
            </span>
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:contents">
        <Metric label={t("Puntuación", "Score")}>
          <span className={cn("num rounded-md px-2 py-0.5 font-bold", toneSoft(b.tone), toneText(b.tone))}>{b.score} / 100</span>
        </Metric>
        <Metric label={unit}>
          <span className="num font-semibold">
            {b.positive} / {b.ran}
          </span>
        </Metric>
        <Metric label={t("Veredicto", "Verdict")}>
          <span className={cn("font-semibold", toneText(b.tone))}>{headlineShort(b.test, b.headline, t)}</span>
        </Metric>
        <span aria-hidden className="hidden lg:block" />
        <span aria-hidden className="hidden lg:block" />
        <span className="sr-only">{columns.length}</span>
      </dl>

      <Sparkline values={b.curve} width={120} height={32} className="ml-auto hidden xl:block" />
      <ChevronRightIcon
        aria-hidden
        className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground lg:block"
      />
    </button>
  )
}

/** Average of the group's equity curves (all normalized to 100), for the row's sparkline. */
function averageCurve(items: BatchRecord["items"]): number[] {
  const curves = items.map((i) => i.equity).filter((c) => c.length > 1)
  if (curves.length === 0) return []
  const length = Math.min(...curves.map((c) => c.length))
  return Array.from({ length }, (_, k) => curves.reduce((sum, c) => sum + c[Math.round((k * (c.length - 1)) / (length - 1))], 0) / curves.length)
}

/** A multi-asset group: one row summarizing every asset it ran. */
function BatchRow({ backtest: b, onOpen }: { backtest: BatchRecord; onOpen: () => void }) {
  const { locale, t } = useI18n()
  const decimal = numberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const columns = [
    t("Rentab. media", "Average return"),
    t("Rentables", "Profitable"),
    t("Superan a mantener", "Beat holding"),
    t("Mejor", "Best"),
    t("Peor", "Worst"),
  ]
  const ran = b.items.flatMap((i) => (i.stats ? [{ symbol: i.symbol, ...i.stats }] : []))
  const mean = ran.length ? ran.reduce((sum, r) => sum + r.returnPct, 0) / ran.length : null
  const sorted = [...ran].sort((x, y) => y.returnPct - x.returnPct)
  const best = sorted[0]
  const worst = sorted.at(-1)
  const profitable = ran.filter((r) => r.returnPct > 0).length
  const beats = ran.filter((r) => r.returnPct > r.benchmarkReturnPct).length
  const shown = b.symbols.slice(0, 3)
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${decimal.format(Math.abs(v))}%`
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`group grid w-full gap-4 text-left px-4 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset md:px-5 ${rowGrid}`}
    >
      <div className="flex min-w-0 items-center gap-3 pr-10 lg:pr-0">
        <span className="flex shrink-0 -space-x-2.5" aria-hidden>
          {shown.map((symbol) => (
            <AssetAvatar key={symbol} symbol={symbol} size={32} className="ring-2 ring-card" />
          ))}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{t(`${b.symbols.length} activos`, `${b.symbols.length} assets`)}</span>
            <span className="truncate text-muted-foreground">{b.strategy.name}</span>
          </span>
          <span className="num flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
            <Badge variant="outline" className="h-5 px-1.5">
              {b.timeframe}
            </Badge>
            <span className="truncate">{b.symbols.join(" · ")}</span>
            <span aria-hidden>·</span>
            <span>
              {formatDate(b.from, locale)} → {formatDate(b.to, locale)}
            </span>
            <span aria-hidden>·</span>
            <span>
              {t("Ejecutado el", "Run on")} {formatDate(b.executedAt, locale)}
            </span>
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:contents">
        <Metric label={columns[0]}>{mean === null ? "—" : <PriceChange value={mean} variant="pill" locale={locale} />}</Metric>
        <Metric label={columns[1]}>
          <span className="num font-semibold">
            {profitable} / {ran.length}
          </span>
        </Metric>
        <Metric label={columns[2]}>
          <span className="num font-semibold">
            {beats} / {ran.length}
          </span>
        </Metric>
        <Metric label={columns[3]}>
          {best ? (
            <span className="num flex flex-col font-semibold lg:items-end">
              <span>{best.symbol}</span>
              <span className={best.returnPct >= 0 ? "text-[11px] text-up" : "text-[11px] text-down"}>{signed(best.returnPct)}</span>
            </span>
          ) : (
            "—"
          )}
        </Metric>
        <Metric label={columns[4]}>
          {worst ? (
            <span className="num flex flex-col font-semibold lg:items-end">
              <span>{worst.symbol}</span>
              <span className={worst.returnPct >= 0 ? "text-[11px] text-up" : "text-[11px] text-down"}>{signed(worst.returnPct)}</span>
            </span>
          ) : (
            "—"
          )}
        </Metric>
      </dl>

      <Sparkline values={averageCurve(b.items)} width={120} height={32} className="ml-auto hidden xl:block" />
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
