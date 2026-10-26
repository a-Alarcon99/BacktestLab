"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CloudOffIcon, LockIcon, PlayIcon, ServerIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Field, Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { formatDate, numberFormat } from "@/lib/format"
import type { AssetInfo } from "@/lib/market"
import type { McMethod } from "@/lib/monte-carlo"
import { engineCandles, MC_MIN_CANDLES, MC_MIN_PATHS, MC_PATHS_UNITS, mcDefaultBlock, mcMaxPathsFor } from "@/lib/robustness-plan"
import { remainingBacktests, useMe } from "@/lib/session"
import { BacktestSetupFields, NotRunnable, useBacktestSetup } from "../backtest-setup"
import { REPLAY_DIALOG_CLASS } from "../backtest-replay"
import { McExplainer, type McMode } from "../montecarlo/mc-explainers"
import { McPlayer } from "../montecarlo/mc-player"
import type { McRun } from "../montecarlo/mc-types"
import { testMeta } from "../robust/test-meta"
import { AssetCard } from "./robust-panels"

const TRADE_RUNS = ["200", "1000", "2000", "5000"] as const
const PATH_RUNS = [50, 100, 200, 500, 1000] as const
const BLOCKS = ["short", "auto", "long"] as const
type Block = (typeof BLOCKS)[number]

/** Monte Carlo: pick the asset, the kind of Monte Carlo, then set it up and run it. */
export function McPanel({ assets, today }: { assets: AssetInfo[]; today: string }) {
  const [symbol, setSymbol] = useState(assets[0]?.symbol ?? "")
  const asset = assets.find((a) => a.symbol === symbol)
  if (!asset) return null
  return (
    <div className="flex flex-col gap-4">
      <AssetCard assets={assets} symbol={symbol} onChange={setSymbol} />
      {/* Keyed by asset: the range and timeframe start over, because the history differs. */}
      <McForm key={asset.symbol} asset={asset} today={today} />
    </div>
  )
}

function ModeCard({ mode, current, onSelect, locked, children }: { mode: McMode; current: McMode; onSelect: (mode: McMode) => void; locked?: boolean; children: React.ReactNode }) {
  const { t } = useI18n()
  const meta = testMeta(mode, t)
  const on = mode === current
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={() => onSelect(mode)}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border p-4 text-left outline-none transition-[border-color,box-shadow,background-color] focus-visible:ring-3 focus-visible:ring-ring/30",
        on ? "border-primary bg-accent/50 shadow-lg shadow-primary/10" : "hover:bg-muted/40"
      )}
    >
      <span className="flex items-center gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-xl [&_svg]:size-5", on ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>{meta.icon}</span>
        <span className="text-title font-bold">{meta.title}</span>
        {locked && <LockIcon aria-label={t("No incluido en tu plan", "Not in your plan")} className="ml-auto size-4 text-muted-foreground" />}
      </span>
      <span className="text-caption text-muted-foreground">{meta.text}</span>
      <span className="flex flex-wrap gap-1.5">{children}</span>
    </button>
  )
}

function McForm({ asset, today }: { asset: AssetInfo; today: string }) {
  const { locale, t, href } = useI18n()
  const me = useMe()
  const remaining = remainingBacktests(me)
  const setup = useBacktestSetup({ today, historySince: asset.historySince })
  const { strategy, strategies, timeframe, from, to, valid, rangeOk } = setup
  const count = numberFormat(locale, { useGrouping: "always" })
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<McMode>("mc-trades")
  const [method, setMethod] = useState<McMethod>("resample")
  const [tradeRuns, setTradeRuns] = useState<(typeof TRADE_RUNS)[number]>("1000")
  const [pathRuns, setPathRuns] = useState<number>(100)
  const [block, setBlock] = useState<Block>("auto")
  const [seedText, setSeedText] = useState("")

  const planMax = me?.plan.maxMcPaths ?? 0
  const pathsAllowed = me === undefined || planMax >= MC_MIN_PATHS
  const candles = valid ? engineCandles(from, to, timeframe) : 0
  const maxPaths = valid ? Math.min(planMax || 1000, mcMaxPathsFor(from, to, timeframe)) : 0
  const runsOptions = PATH_RUNS.filter((n) => n <= maxPaths)
  const runs = runsOptions.includes(pathRuns as never) ? pathRuns : (runsOptions.at(-1) ?? 0)
  const auto = mcDefaultBlock(Math.round(candles))
  const blockLength: Record<Block, number> = {
    short: Math.max(2, Math.round(auto * 0.4)),
    auto,
    long: Math.min(Math.max(2, Math.round(candles)), Math.round(auto * 2.5)),
  }
  const seed = seedText.trim() === "" ? undefined : Math.min(2 ** 31 - 1, Math.max(0, Math.floor(Number(seedText) || 0)))

  const paths = mode === "mc-paths"
  const units = paths ? MC_PATHS_UNITS : 1
  const problem = paths
    ? !pathsAllowed
      ? t("Tu plan no incluye los mercados sintéticos.", "Your plan doesn't include synthetic markets.")
      : valid && candles < MC_MIN_CANDLES
        ? t(`El rango necesita al menos ${MC_MIN_CANDLES} velas: amplía las fechas o usa una temporalidad menor.`, `The range needs at least ${MC_MIN_CANDLES} candles: widen the dates or use a smaller timeframe.`)
        : runsOptions.length === 0 && valid
          ? t("Con este rango tan largo no cabe ninguna simulación; acórtalo o usa una temporalidad mayor.", "No simulation fits in a range this long; shorten it or use a larger timeframe.")
          : null
    : null
  const canRun = rangeOk && strategy !== undefined && problem === null

  const run = useMemo<McRun | null>(() => {
    if (!canRun || !strategy) return null
    const base = { symbol: asset.symbol, timeframe, from, to, strategy, mode: "new" as const }
    if (mode === "mc-trades") return { ...base, kind: "mc-trades", method, runs: Number(tradeRuns), seed: seed ?? 1 }
    return { ...base, kind: "mc-paths", runs, blockLength: blockLength[block], ...(seed !== undefined ? { seed } : {}) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun, strategy, asset.symbol, timeframe, from, to, mode, method, tradeRuns, runs, block, seed, auto])

  const label = (key: Block) => (key === "short" ? t("Corta", "Short") : key === "auto" ? t("Media", "Medium") : t("Larga", "Long"))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monte Carlo</CardTitle>
        <Badge variant="primary" className="[&_svg]:size-3.5">
          {testMeta(mode, t).icon}
          {paths ? t(`${units} backtests`, `${units} backtests`) : t("1 backtest", "1 backtest")}
        </Badge>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2 lg:col-span-2">
          <p className="max-w-3xl text-muted-foreground">
            {t(
              "Tu backtest es una sola historia posible. Monte Carlo crea miles de historias alternativas para responder a una pregunta: ¿tu estrategia tiene una ventaja real o su resultado se debió al azar?",
              "Your backtest is a single possible history. Monte Carlo creates thousands of alternative histories to answer one question: does your strategy have a real edge or was its result down to chance?"
            )}
          </p>
          <div role="radiogroup" aria-label={t("Tipo de Monte Carlo", "Kind of Monte Carlo")} className="grid gap-3 md:grid-cols-2">
            <ModeCard mode="mc-trades" current={mode} onSelect={setMode}>
              <Badge variant="up">
                <CloudOffIcon />
                {t("Se calcula en tu navegador", "Calculated in your browser")}
              </Badge>
              <Badge>{t("Usa 1 backtest", "Uses 1 backtest")}</Badge>
            </ModeCard>
            <ModeCard mode="mc-paths" current={mode} onSelect={setMode} locked={!pathsAllowed}>
              <Badge variant="primary">
                <ServerIcon />
                {t("Lo calcula el servidor", "Calculated by the server")}
              </Badge>
              <Badge>{t(`Usa ${MC_PATHS_UNITS} backtests`, `Uses ${MC_PATHS_UNITS} backtests`)}</Badge>
            </ModeCard>
          </div>
        </div>

        <McExplainer mode={mode} method={method} />

        {mode === "mc-trades" ? (
          <>
            <Field
              label={t("¿Cómo mezclamos tus operaciones?", "How do we mix your trades?")}
              hint={
                method === "shuffle"
                  ? t("Las mismas operaciones en otro orden: el resultado final no cambia, pero ves cuánto podría haber caído.", "The same trades in another order: the final result doesn't change, but you see how far it could have fallen.")
                  : t("Sacando operaciones al azar de las tuyas, pudiendo repetir: ves qué resultados eran posibles con la misma estrategia.", "Drawing trades at random from yours, allowing repeats: you see which results were possible with the same strategy.")
              }
            >
              <SegmentedControl
                label={t("Método", "Method")}
                options={["resample", "shuffle"] as const}
                value={method}
                onValueChange={setMethod}
                labels={{ resample: t("Sacar al azar", "Draw at random"), shuffle: t("Cambiar el orden", "Change the order") }}
                size="sm"
              />
            </Field>
            <Field label={t("Número de simulaciones", "Number of simulations")} hint={t("Más simulaciones dan una imagen más estable. Son gratis: se hacen en tu navegador.", "More simulations give a steadier picture. They are free: they run in your browser.")}>
              <SegmentedControl label={t("Simulaciones", "Simulations")} options={TRADE_RUNS} value={tradeRuns} onValueChange={setTradeRuns} labels={Object.fromEntries(TRADE_RUNS.map((n) => [n, count.format(Number(n))]))} size="sm" />
            </Field>
          </>
        ) : (
          <>
            <Field label={t("Número de mercados sintéticos", "Number of synthetic markets")} hint={t("Más mercados dan una imagen más fiable pero tardan más. El máximo depende de tu plan y del tamaño del rango.", "More markets give a more reliable picture but take longer. The maximum depends on your plan and the size of the range.")}>
              {runsOptions.length === 0 ? (
                <p className="text-caption text-muted-foreground">—</p>
              ) : (
                <SegmentedControl label={t("Mercados", "Markets")} options={runsOptions.map(String) as [string, ...string[]]} value={String(runs)} onValueChange={(v) => setPathRuns(Number(v))} labels={Object.fromEntries(runsOptions.map((n) => [String(n), count.format(n)]))} size="sm" />
              )}
            </Field>
            <Field
              label={t("Memoria del mercado", "Market memory")}
              hint={t(
                `Cuánto del orden real se conserva: trozos de ${count.format(blockLength[block])} velas seguidas. Cortos = más azar; largos = más parecido al mercado real.`,
                `How much of the real order is kept: pieces of ${count.format(blockLength[block])} consecutive candles. Short = more random; long = closer to the real market.`
              )}
            >
              <SegmentedControl label={t("Memoria", "Memory")} options={BLOCKS} value={block} onValueChange={setBlock} labels={{ short: label("short"), auto: label("auto"), long: label("long") }} size="sm" />
            </Field>
          </>
        )}

        <details className="rounded-lg border p-3 lg:col-span-2">
          <summary className="cursor-pointer text-caption font-semibold">{t("Ajustes avanzados", "Advanced settings")}</summary>
          <div className="mt-3 max-w-sm">
            <Field
              label={t("Semilla del azar (opcional)", "Random seed (optional)")}
              htmlFor="mc-seed"
              hint={t("Con la misma semilla sale siempre lo mismo. Cámbiala para ver otras historias; en los mercados sintéticos una semilla nueva cuenta como una ejecución nueva.", "With the same seed you always get the same result. Change it to see other histories; with synthetic markets a new seed counts as a new run.")}
            >
              <Input id="mc-seed" name="seed" type="number" min={0} max={2147483647} inputMode="numeric" placeholder={t("automática", "automatic")} value={seedText} onChange={(e) => setSeedText(e.target.value)} className="w-40" />
            </Field>
          </div>
        </details>

        <BacktestSetupFields setup={setup} />
      </CardContent>

      <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <div className="num flex flex-col gap-1 text-caption text-muted-foreground">
          {valid ? (
            <span>
              <span className="font-semibold text-foreground">{asset.symbol}/USDT</span> · {formatDate(from, locale)} → {formatDate(to, locale)} · {timeframe} · ≈ {count.format(Math.round(candles))} {t("velas", "candles")}
            </span>
          ) : (
            <span>{t("Revisa el rango de fechas.", "Check the date range.")}</span>
          )}
          <span>
            {paths
              ? t(`Consumirá ${units} backtests, sean 50 o 1 000 mercados; repetirla con los mismos ajustes después es gratis.`, `It will use ${units} backtests, whether it is 50 or 1,000 markets; running it again with the same settings afterwards is free.`)
              : t("Consumirá 1 backtest (la estrategia se ejecuta una vez); las simulaciones son gratis y no salen de tu navegador.", "It will use 1 backtest (the strategy runs once); the simulations are free and never leave your browser.")}
            {remaining !== null && units > remaining && <span className="block text-destructive">{t(`Te quedan ${remaining}: si esta ejecución es nueva, no podrá completarse.`, `You have ${remaining} left: if this run is new, it can't be completed.`)}</span>}
          </span>
          {valid && problem && <span className="text-destructive">{problem}</span>}
          {!pathsAllowed && paths && (
            <Link href={href(me?.user ? "/plans" : "/signup")} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}>
              {me?.user ? t("Ver planes", "View plans") : t("Crear cuenta gratis", "Create a free account")}
            </Link>
          )}
        </div>
        <Button size="lg" type="button" disabled={!run} onClick={() => setOpen(true)}>
          <PlayIcon data-icon="inline-start" />
          {t("Ejecutar Monte Carlo", "Run Monte Carlo")}
        </Button>
      </footer>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={run ? REPLAY_DIALOG_CLASS : "w-[min(32rem,calc(100vw-1.5rem))]"}>
          {run ? <McPlayer run={run} onClose={() => setOpen(false)} /> : <NotRunnable reason={strategies?.length === 0 ? "no-strategy" : "range"} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
