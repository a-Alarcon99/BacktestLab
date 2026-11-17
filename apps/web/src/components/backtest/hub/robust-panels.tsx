"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { LockIcon, PlayIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import type { Timeframe } from "@/lib/candles"
import { formatDate, numberFormat } from "@/lib/format"
import type { AssetInfo } from "@/lib/market"
import {
  candlesPerDays,
  chosenTimeframes,
  DAY_MS,
  engineCandles,
  ENGINE_MAX_WORK,
  MAX_AXES,
  MAX_EXTRA_TIMEFRAMES,
  MIN_CANDLES,
  neighborTimeframes,
  sensitivityCells,
  sensitivityParams,
  valuesFromEdits,
  TIMEFRAME_ORDER,
  timeframeFits,
  windowCount,
} from "@/lib/robustness-plan"
import type { RobustTest } from "@/lib/robustness-report"
import { remainingBacktests, useMe } from "@/lib/session"
import { BacktestSetupFields, NotRunnable, useBacktestSetup } from "../backtest-setup"
import { REPLAY_DIALOG_CLASS } from "../backtest-replay"
import { TestExplainer } from "../robust/explainers"
import { RobustReplayPlayer, type RobustRun } from "../robust/robust-replay"
import { fieldLabel, kindLabel, testMeta } from "../robust/test-meta"

const LENGTHS = ["30", "60", "90", "180", "365"] as const

/** Timeframes besides the chosen one that the form lets the user tick (the API accepts a few more). */
const MAX_UI_EXTRAS = Math.min(4, MAX_EXTRA_TIMEFRAMES)

/** Asset to test: the robustness tests run on one asset at a time. */
export function AssetCard({ assets, symbol, onChange }: { assets: AssetInfo[]; symbol: string; onChange: (symbol: string) => void }) {
  const { t } = useI18n()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Activo", "Asset")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Field label={t("Activo a probar", "Asset to test")} htmlFor="robust-asset">
          <Select id="robust-asset" name="asset" value={symbol} onChange={(e) => onChange(e.target.value)}>
            {assets.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol} · {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </CardContent>
    </Card>
  )
}

/** Shown to plans that can't run several simulations at once (guests). */
function Locked({ test }: { test: RobustTest }) {
  const { t, href } = useI18n()
  const me = useMe()
  const meta = testMeta(test, t)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{meta.title}</CardTitle>
        <Badge>
          <LockIcon />
          {t("No incluido en tu plan", "Not in your plan")}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="max-w-2xl text-muted-foreground">
          {meta.text} {t("Crea una cuenta gratis para probarlo: cada simulación cuenta como un backtest.", "Create a free account to try it: each simulation counts as a backtest.")}
        </p>
        <Link href={href(me?.user ? "/plans" : "/signup")} className={buttonVariants()}>
          {me?.user ? t("Ver planes", "View plans") : t("Crear cuenta gratis", "Create a free account")}
        </Link>
      </CardContent>
    </Card>
  )
}

/** One robustness test: pick the asset, then set it up and run it. */
export function RobustPanel({ test, assets, today }: { test: RobustTest; assets: AssetInfo[]; today: string }) {
  const me = useMe()
  const [symbol, setSymbol] = useState(assets[0]?.symbol ?? "")
  const asset = assets.find((a) => a.symbol === symbol)
  if (!asset) return null
  if (me !== undefined && me.plan.maxBatchItems <= 1) return <Locked test={test} />
  return (
    <div className="flex flex-col gap-4">
      <AssetCard assets={assets} symbol={symbol} onChange={setSymbol} />
      {/* Keyed by asset: the range and timeframe start over, because the history differs. */}
      <RobustForm key={asset.symbol} test={test} asset={asset} today={today} />
    </div>
  )
}

function RobustForm({ test, asset, today }: { test: RobustTest; asset: AssetInfo; today: string }) {
  const { locale, t } = useI18n()
  const me = useMe()
  const maxItems = me?.plan.maxBatchItems ?? 1
  const remaining = remainingBacktests(me)
  const setup = useBacktestSetup({ today, historySince: asset.historySince })
  const { strategy, strategies, timeframe, from, to, valid, rangeOk } = setup
  const [open, setOpen] = useState(false)
  const count = numberFormat(locale, { useGrouping: "always" })
  const meta = testMeta(test, t)

  // --- Windows: length and step follow the range until the user sets them.
  const days = valid ? Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1 : 0
  const autoLength = Math.min(3650, Math.max(15, Math.round(days / 15) * 5))
  const [custom, setCustom] = useState<{ length: number; step: number } | null>(null)
  const length = custom?.length ?? autoLength
  const step = custom?.step ?? Math.max(1, Math.round(autoLength / 2))
  const windows = valid ? windowCount(from, to, length, step) : 0
  const perWindow = candlesPerDays(length, timeframe)

  // --- Sensitivity: parameters of the chosen strategy, up to two.
  const params = useMemo(() => (strategy ? sensitivityParams(strategy) : []), [strategy])
  const [picked, setPicked] = useState<string[] | null>(null)
  const chosen = useMemo(() => (picked ?? (params[0] ? [params[0].id] : [])).filter((id) => params.some((p) => p.id === id)), [picked, params])

  // The four values typed for each parameter (the original stays in the middle of the five).
  // What is typed is kept as text; what is sent is kept inside what the parameter accepts.
  const [editsOf, setEditsOf] = useState<Record<string, string[]>>({})
  const editsFor = (p: (typeof params)[number]) => editsOf[p.id] ?? [p.values[0], p.values[1], p.values[3], p.values[4]].map(String)
  const toValues = (p: (typeof params)[number]) => {
    const defaults = [p.values[0], p.values[1], p.values[3], p.values[4]]
    return valuesFromEdits(p, editsFor(p).map((text, n) => (text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : defaults[n])))
  }
  const valuesKey = JSON.stringify(chosen.map((id) => { const p = params.find((x) => x.id === id); return p ? toValues(p) : [] }))
  const sentValues = useMemo(() => JSON.parse(valuesKey) as number[][], [valuesKey])

  // --- Timeframes: the one asked for plus the ones ticked (its neighbours until the user ticks).
  const [pickedFrames, setPickedFrames] = useState<Timeframe[] | null>(null)
  const extras = useMemo(() => {
    if (!valid) return []
    const wanted = pickedFrames ?? neighborTimeframes(timeframe, from, to).filter((tf) => tf !== timeframe)
    return wanted.filter((tf) => tf !== timeframe && timeframeFits(tf, from, to)).slice(0, MAX_UI_EXTRAS)
  }, [valid, pickedFrames, timeframe, from, to])
  const frames = useMemo(() => (valid ? chosenTimeframes(timeframe, extras, from, to) : []), [valid, timeframe, extras, from, to])
  const toggleFrame = (tf: Timeframe) => setPickedFrames(extras.includes(tf) ? extras.filter((x) => x !== tf) : [...extras, tf])

  const candles = valid ? engineCandles(from, to, timeframe) : 0
  let units = 0
  let work = 0
  if (test === "windows") {
    units = windows
    work = windows * perWindow
  } else if (test === "sensitivity") {
    units = chosen.length ? sensitivityCells(chosen.length) : 0
    work = units * candles
  } else {
    units = frames.length
    work = frames.reduce((sum, tf) => sum + engineCandles(from, to, tf), 0)
  }
  const workOk = work <= ENGINE_MAX_WORK
  const fits = units <= maxItems

  const problem =
    test === "windows"
      ? windows < 2
        ? t("El rango debe caber al menos dos veces la ventana: acorta la ventana o amplía las fechas.", "The range must fit the window at least twice: shorten the window or widen the dates.")
        : perWindow < MIN_CANDLES
          ? t(`Cada ventana necesita al menos ${MIN_CANDLES} velas: alarga la ventana o usa una temporalidad menor.`, `Each window needs at least ${MIN_CANDLES} candles: lengthen it or use a smaller timeframe.`)
          : null
      : test === "sensitivity"
        ? params.length === 0 && strategy
          ? t("Esta estrategia no tiene parámetros numéricos que variar (solo patrones de velas o periodicidad).", "This strategy has no numeric parameters to vary (only candle patterns or periodicity).")
          : chosen.length === 0
            ? t("Elige al menos un parámetro.", "Pick at least one parameter.")
            : null
        : frames.length < 2
          ? t("Marca al menos otra temporalidad que encaje con este rango.", "Tick at least one other timeframe that fits this range.")
          : null

  const canRun = rangeOk && strategy !== undefined && problem === null && workOk && fits && units >= 2

  const run = useMemo<RobustRun | null>(() => {
    if (!canRun || !strategy) return null
    const base = { symbol: asset.symbol, timeframe, from, to, strategy, mode: "new" as const }
    if (test === "windows") return { ...base, kind: "windows", lengthDays: length, stepDays: step }
    if (test === "sensitivity") return { ...base, kind: "sensitivity", params: chosen, values: sentValues }
    return { ...base, kind: "timeframes", timeframes: extras }
  }, [canRun, strategy, asset.symbol, timeframe, from, to, test, length, step, chosen, sentValues, extras])

  const toggleParam = (id: string) => {
    const current = chosen
    if (current.includes(id)) setPicked(current.filter((p) => p !== id))
    else if (current.length < MAX_AXES) setPicked([...current, id])
    else setPicked([...current.slice(1), id])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{meta.title}</CardTitle>
        <Badge variant="primary" className="[&_svg]:size-3.5">
          {meta.icon}
          {units > 0 ? t(`${units} simulaciones`, `${units} simulations`) : "—"} / {maxItems}
        </Badge>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-2">
        <TestExplainer test={test} length={test === "windows" ? length : undefined} step={test === "windows" ? step : undefined} windows={test === "windows" && windows >= 2 ? windows : undefined} frames={test === "timeframes" ? frames : undefined} />

        {test === "windows" && (
          <>
            <Field
              label={t("Longitud de la ventana (días)", "Window length (days)")}
              htmlFor="win-length"
              hint={t("Cada ventana reinicia la estrategia con el capital completo.", "Each window restarts the strategy with the full capital.")}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input id="win-length" name="length" type="number" min={2} max={3650} value={length} className="w-28" onChange={(e) => setCustom({ length: Math.max(2, Math.floor(Number(e.target.value) || 0)), step })} />
                <SegmentedControl
                  label={t("Longitud predefinida", "Preset length")}
                  options={LENGTHS}
                  value={(LENGTHS as readonly string[]).includes(String(length)) ? (String(length) as (typeof LENGTHS)[number]) : ("" as (typeof LENGTHS)[number])}
                  onValueChange={(v) => setCustom({ length: Number(v), step: Math.max(1, Math.min(step, Number(v))) })}
                  size="sm"
                />
              </div>
            </Field>
            <Field
              label={t("Paso entre ventanas (días)", "Step between windows (days)")}
              htmlFor="win-step"
              hint={
                windows >= 2
                  ? t(`Salen ${windows} ventanas${step < length ? ", solapadas" : ""}. Cada una cuenta como un backtest.`, `That makes ${windows} windows${step < length ? ", overlapping" : ""}. Each counts as one backtest.`)
                  : undefined
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input id="win-step" name="step" type="number" min={1} max={3650} value={step} className="w-28" onChange={(e) => setCustom({ length, step: Math.max(1, Math.floor(Number(e.target.value) || 0)) })} />
                <Button type="button" variant="outline" size="sm" onClick={() => setCustom({ length, step: length })}>
                  {t("Sin solape", "No overlap")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setCustom({ length, step: Math.max(1, Math.round(length / 2)) })}>
                  {t("Mitad", "Half")}
                </Button>
              </div>
            </Field>
          </>
        )}

        {test === "sensitivity" && (
          <Field
            label={t("Parámetros a variar (hasta 2)", "Parameters to vary (up to 2)")}
            className="lg:col-span-2"
            hint={t(
              "Cada parámetro se prueba en cinco valores, los cuatro que elijas abajo más el original (por defecto ±10 % y ±20 %); con dos se prueban todas las combinaciones (25 backtests).",
              "Each parameter is tried at five values, the four you set below plus the original (±10 % and ±20 % by default); with two, all combinations are tried (25 backtests)."
            )}
          >
            {strategies === undefined ? (
              <div aria-hidden className="h-10 animate-pulse rounded-lg bg-muted/40" />
            ) : params.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-caption text-muted-foreground">
                {t("Esta estrategia no tiene parámetros numéricos que variar.", "This strategy has no numeric parameters to vary.")}
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {params.map((p) => {
                  const on = chosen.includes(p.id)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleParam(p.id)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
                          on ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted/60"
                        )}
                      >
                        <span className="text-caption font-semibold">
                          {p.side === "buy" ? t("Compra", "Buy") : t("Venta", "Sell")} · {kindLabel(p.kind, t)} {fieldLabel(p.field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), t)}
                        </span>
                        <span className="num text-[11px] text-muted-foreground">
                          {p.values.map((v) => count.format(v)).join(" · ")}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Field>
        )}

        {test === "sensitivity" && chosen.length > 0 && (
          <div className="grid gap-3 lg:col-span-2 sm:grid-cols-2">
            {chosen.map((id, k) => {
              const p = params.find((x) => x.id === id)
              if (!p) return null
              const name = `${kindLabel(p.kind, t)} ${fieldLabel(p.field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), t)}`
              const edits = editsFor(p)
              const input = (n: number) => (
                <Input
                  key={n}
                  id={`sens-value-${k}-${n}`}
                  name={`value-${k}-${n}`}
                  aria-label={t(`${name}: valor ${n + 1}`, `${name}: value ${n + 1}`)}
                  type="number"
                  min={p.lo}
                  max={p.hi}
                  step={p.integer ? 1 : "any"}
                  value={edits[n]}
                  className="w-20"
                  onChange={(e) => setEditsOf((current) => ({ ...current, [id]: editsFor(p).map((text, m) => (m === n ? e.target.value : text)) }))}
                  onBlur={() => setEditsOf((current) => ({ ...current, [id]: [...toValues(p).slice(0, 2), ...toValues(p).slice(3)].map(String) }))}
                />
              )
              return (
                <Field
                  key={id}
                  label={t(`Valores de ${name}`, `Values of ${name}`)}
                  htmlFor={`sens-value-${k}-0`}
                  hint={t(
                    `Dos valores por debajo y dos por encima del original, entre ${count.format(p.lo)} y ${count.format(p.hi)}. Se probarán: ${sentValues[k]?.map((v) => count.format(v)).join(" · ")}`,
                    `Two values below and two above the original, between ${count.format(p.lo)} and ${count.format(p.hi)}. They will be tried: ${sentValues[k]?.map((v) => count.format(v)).join(" · ")}`
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {input(0)}
                    {input(1)}
                    <span className="num flex h-9 min-w-16 items-center justify-center rounded-lg border border-primary bg-accent px-2 text-sm font-semibold" title={t("Valor original", "Original value")}>
                      {count.format(p.base)}
                    </span>
                    {input(2)}
                    {input(3)}
                  </div>
                </Field>
              )
            })}
          </div>
        )}

        {test === "timeframes" && (
          <Field
            label={t("Temporalidades que se probarán", "Timeframes that will be tried")}
            className="lg:col-span-2"
            hint={t(
              `Marca hasta ${MAX_UI_EXTRAS} además de la elegida más abajo. Solo valen las que dan entre 10 y 100 000 velas en el rango.`,
              `Tick up to ${MAX_UI_EXTRAS} besides the one chosen below. Only those that give between 10 and 100,000 candles in the range are allowed.`
            )}
          >
            <ul className="flex flex-wrap gap-2" aria-label={t("Temporalidades", "Timeframes")}>
              {TIMEFRAME_ORDER.map((tf) => {
                const isRef = tf === timeframe
                const fits = valid && timeframeFits(tf, from, to)
                const on = isRef || extras.includes(tf)
                const full = !on && extras.length >= MAX_UI_EXTRAS
                const candles = valid ? Math.round(engineCandles(from, to, tf)) : 0
                return (
                  <li key={tf}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={isRef || !fits || full}
                      onClick={() => toggleFrame(tf)}
                      title={isRef ? t("La temporalidad elegida abajo: siempre se prueba", "The timeframe chosen below: it is always tried") : !fits ? t("Con este rango da menos de 10 o más de 100 000 velas", "With this range it gives fewer than 10 or more than 100,000 candles") : undefined}
                      className={cn(
                        "flex min-w-[4.5rem] flex-col items-center gap-0 rounded-lg border px-3 py-1.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed",
                        on ? "border-primary bg-accent text-accent-foreground" : fits && !full ? "hover:bg-muted/60" : "opacity-45"
                      )}
                    >
                      <span className="num font-bold">{tf}</span>
                      <span className="num text-[10px] text-muted-foreground">{fits || isRef ? `${count.format(candles)} ${t("velas", "candles")}` : t("fuera de rango", "out of range")}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Field>
        )}

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
          {units >= 2 && (
            <span>
              {t(`Consumirá ${units} backtests (uno por simulación); repetirla después es gratis.`, `It will use ${units} backtests (one per simulation); running it again afterwards is free.`)}
              {remaining !== null && units > remaining && (
                <span className="block text-destructive">{t(`Te quedan ${remaining}: si esta ejecución es nueva, no podrá completarse.`, `You have ${remaining} left: if this run is new, it can't be completed.`)}</span>
              )}
            </span>
          )}
          {valid && !fits && units > 0 && (
            <span className="text-destructive">
              {t(`Tu plan permite hasta ${maxItems} simulaciones por ejecución; esta necesita ${units}.`, `Your plan allows up to ${maxItems} simulations per run; this one needs ${units}.`)}
            </span>
          )}
          {valid && !workOk && (
            <span className="text-destructive">
              {t(
                `Demasiado trabajo para una ejecución (máximo ${count.format(ENGINE_MAX_WORK)} velas en total): acorta el rango o usa una temporalidad mayor.`,
                `Too much work for one run (at most ${count.format(ENGINE_MAX_WORK)} candles in total): shorten the range or use a longer timeframe.`
              )}
            </span>
          )}
          {valid && problem && <span className="text-destructive">{problem}</span>}
        </div>
        <Button size="lg" type="button" disabled={!run} onClick={() => setOpen(true)}>
          <PlayIcon data-icon="inline-start" />
          {t("Ejecutar prueba", "Run test")}
        </Button>
      </footer>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={run ? REPLAY_DIALOG_CLASS : "w-[min(32rem,calc(100vw-1.5rem))]"}>
          {run ? <RobustReplayPlayer run={run} onClose={() => setOpen(false)} /> : <NotRunnable reason={strategies?.length === 0 ? "no-strategy" : "range"} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

