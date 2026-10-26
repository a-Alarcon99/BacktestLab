"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { LayersIcon, LockIcon, PlayIcon, SearchIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Field, Input } from "@/components/ui/input"
import { maxBacktestCandles, maxBatchWork } from "@/lib/candles"
import { formatDate, numberFormat } from "@/lib/format"
import type { AssetInfo } from "@/lib/market"
import { remainingBacktests, useMe } from "@/lib/session"
import { BacktestSetupFields, NotRunnable, useBacktestSetup } from "../backtest-setup"
import { REPLAY_DIALOG_CLASS } from "../backtest-replay"
import { MultiReplayPlayer, type MultiRun } from "../multi/multi-replay"

/**
 * Same strategy over several assets, each with the full capital. The asset picker is the only
 * thing that differs from a single run; the plan decides how many assets fit in one run, and each
 * asset costs one backtest (the server counts them).
 */
function MultiAssetPanel({ assets, today }: { assets: AssetInfo[]; today: string }) {
  const { locale, t, href } = useI18n()
  const me = useMe()
  const maxItems = me?.plan.maxBatchItems ?? 1
  // Assets whose history begins later just start later in the run, so the range may reach back
  // as far as the oldest one.
  const earliest = useMemo(() => assets.reduce((min, a) => (a.historySince < min ? a.historySince : min), today), [assets, today])
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const n = selected.length
  const perRun = Math.min(maxBacktestCandles, Math.floor(maxBatchWork / Math.max(2, n)))
  const setup = useBacktestSetup({ today, historySince: earliest })
  const { strategy, strategies, timeframe, from, to, valid, candles, rangeOk } = setup
  const count = numberFormat(locale, { useGrouping: "always" })

  const workOk = candles * Math.max(n, 1) <= maxBatchWork
  const remaining = remainingBacktests(me)
  const locked = me !== undefined && maxItems <= 1
  const canRun = rangeOk && workOk && strategy !== undefined && n >= 2 && n <= maxItems

  const run = useMemo<MultiRun | null>(
    () => (canRun && strategy ? { kind: "assets", symbols: selected, strategy, timeframe, from, to, mode: "new" } : null),
    [canRun, selected, strategy, timeframe, from, to]
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? assets.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : assets
  }, [assets, query])

  const toggle = (symbol: string) =>
    setSelected((current) => (current.includes(symbol) ? current.filter((s) => s !== symbol) : current.length < maxItems ? [...current, symbol] : current))

  if (locked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Varios activos", "Several assets")}</CardTitle>
          <Badge>
            <LockIcon />
            {t("No incluido en tu plan", "Not in your plan")}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="max-w-2xl text-muted-foreground">
            {t(
              "Prueba la misma estrategia en varios activos a la vez, cada uno con el capital completo, y comprueba si funciona en todos o solo en uno. Con una cuenta gratis puedes comparar varios activos por ejecución.",
              "Try the same strategy on several assets at once, each with the full capital, and see whether it works on all of them or only on one. With a free account you can compare several assets per run."
            )}
          </p>
          <Link href={href(me?.user ? "/plans" : "/signup")} className={buttonVariants()}>
            {me?.user ? t("Ver planes", "View plans") : t("Crear cuenta gratis", "Create a free account")}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Varios activos", "Several assets")}</CardTitle>
        <Badge variant="primary">
          <LayersIcon />
          {n} / {maxItems}
        </Badge>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <Field
          label={t("Activos", "Assets")}
          className="lg:col-span-2"
          hint={t(
            `Elige de 2 a ${maxItems} activos según tu plan. La misma estrategia se ejecuta en cada uno con su capital completo (no es una cartera con el capital repartido).`,
            `Pick 2 to ${maxItems} assets depending on your plan. The same strategy runs on each with its full capital (it isn't a portfolio sharing the capital).`
          )}
        >
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Buscar activo…", "Search assets…")}
              aria-label={t("Buscar activo", "Search assets")}
              className="pl-9"
            />
          </div>
          <div className="grid max-h-60 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((asset) => {
              const on = selected.includes(asset.symbol)
              const full = !on && n >= maxItems
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() => toggle(asset.symbol)}
                  title={full ? t("Has llegado al máximo de tu plan", "You've reached your plan's maximum") : undefined}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-40",
                    on ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted/60"
                  )}
                >
                  <AssetAvatar symbol={asset.symbol} size={24} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-caption font-semibold">{asset.symbol}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{asset.name}</span>
                  </span>
                </button>
              )
            })}
            {shown.length === 0 && <p className="col-span-full p-2 text-caption text-muted-foreground">{t("Ningún activo coincide.", "No asset matches.")}</p>}
          </div>
          {n > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-caption">
              {selected.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => toggle(symbol)}
                  aria-label={t(`Quitar ${symbol}`, `Remove ${symbol}`)}
                  className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground outline-none hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {symbol}
                  <XIcon className="size-3" />
                </button>
              ))}
              <button type="button" onClick={() => setSelected([])} className="ml-1 text-muted-foreground underline-offset-2 hover:underline">
                {t("Limpiar", "Clear")}
              </button>
            </p>
          )}
        </Field>

        <BacktestSetupFields setup={setup} maxCandles={perRun} />
      </CardContent>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <div className="num flex flex-col gap-1 text-caption text-muted-foreground">
          {valid ? (
            <span>
              <span className="font-semibold text-foreground">{t(`${n} activos`, `${n} assets`)}</span> · {formatDate(from, locale)} → {formatDate(to, locale)} · {timeframe} · ≈{" "}
              {count.format(candles)} {t("velas por activo", "candles per asset")}
            </span>
          ) : (
            <span>{t("Revisa el rango de fechas.", "Check the date range.")}</span>
          )}
          {n >= 2 && (
            <span>
              {t(
                `Consumirá ${n} backtests (uno por activo); repetirla después es gratis.`,
                `It will use ${n} backtests (one per asset); running it again afterwards is free.`
              )}
              {remaining !== null && n > remaining && (
                <span className="block text-destructive">
                  {t(`Te quedan ${remaining}: si esta ejecución es nueva, no podrá completarse.`, `You have ${remaining} left: if this run is new, it can't be completed.`)}
                </span>
              )}
            </span>
          )}
          {valid && !workOk && (
            <span className="text-destructive">
              {t(
                `Demasiado trabajo para una ejecución (máximo ${count.format(maxBatchWork)} velas en total entre todos los activos): acorta el rango, usa una temporalidad mayor o quita activos.`,
                `Too much work for one run (at most ${count.format(maxBatchWork)} candles in total across all assets): shorten the range, use a longer timeframe or remove assets.`
              )}
            </span>
          )}
        </div>
        <Button size="lg" type="button" disabled={!run} onClick={() => setOpen(true)}>
          <PlayIcon data-icon="inline-start" />
          {t("Ejecutar en varios activos", "Run on several assets")}
        </Button>
      </footer>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={run ? REPLAY_DIALOG_CLASS : "w-[min(32rem,calc(100vw-1.5rem))]"}>
          {run ? (
            <MultiReplayPlayer run={run} onClose={() => setOpen(false)} />
          ) : (
            <NotRunnable reason={strategies?.length === 0 ? "no-strategy" : n < 2 ? "assets" : "range"} />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export { MultiAssetPanel }
