"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangleIcon, SaveIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { rangePresetLabels, rangePresets, timeframes, type RangePreset, type Timeframe } from "@/lib/candles"
import { presetNames } from "@/lib/preset-strategies"
import { LimitCta } from "@/components/plan/plan-usage"
import { saveStrategy, useStrategies } from "@/lib/storage/strategies"
import { describeWebError } from "@/lib/web-api"
import {
  DEFAULT_CAPITAL,
  conditionSpecs,
  DEFAULT_FEE_PCT,
  hasErrors,
  validateStrategy,
  type Strategy,
  type StrategyDraft,
} from "@/lib/strategy"
import { COLUMNS, graphToRules, PRICE_ID, rulesToGraph, type Graph } from "@/lib/strategy-graph"
import { FieldError, NumberInput } from "./condition-fields"
import { StrategyBuilder } from "./builder/strategy-builder"

type Details = Omit<StrategyDraft, "rules">
type Draft = { details: Details; graph: Graph }

// The unsaved draft survives a language switch (a full page load) in sessionStorage, and is dropped
// when the user leaves the editor, saves or discards. NaN (an empty number field) isn't valid JSON.
const draftKey = (id?: string) => `bl_strategy_draft:${id ?? "new"}`
const encode = (value: unknown) => JSON.stringify(value, (_, v) => (typeof v === "number" && Number.isNaN(v) ? "__NaN__" : v))
const decode = (raw: string) => JSON.parse(raw, (_, v) => (v === "__NaN__" ? NaN : v)) as unknown

function isDraft(value: unknown): value is Draft {
  const v = value as Draft | null
  if (typeof v?.details?.name !== "string" || !Array.isArray(v.graph?.nodes) || !Array.isArray(v.graph.edges)) return false
  return (
    v.graph.nodes.some((n) => n.id === PRICE_ID) &&
    v.graph.nodes.every(
      (n) =>
        typeof n.id === "string" &&
        n.type in COLUMNS &&
        Number.isInteger(n.col) &&
        Number.isInteger(n.row) &&
        (n.type !== "condition" || n.condition?.kind in conditionSpecs)
    )
  )
}

function readDraft(key: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(key)
    const value = raw ? decode(raw) : null
    return isDraft(value) ? value : null
  } catch {
    return null
  }
}

function detailsOf(strategy?: Strategy): Details {
  return {
    name: strategy?.name ?? "",
    initialCapital: strategy?.initialCapital ?? DEFAULT_CAPITAL,
    feePct: strategy?.feePct ?? DEFAULT_FEE_PCT,
    recommendedTimeframe: strategy?.recommendedTimeframe,
    recommendedRange: strategy?.recommendedRange,
  }
}

/** Restores the draft kept across a language switch (after hydration, so the markup matches the server's). */
function StrategyForm({ strategy }: { strategy?: Strategy }) {
  const key = draftKey(strategy?.id)
  const [saved, setSaved] = useState<Draft | null>(null)
  useEffect(() => {
    const draft = readDraft(key)
    // Deferred (not cancelled on cleanup): React's dev double-run of effects must not lose the draft.
    if (draft) queueMicrotask(() => setSaved(draft))
  }, [key])
  return <StrategyEditor key={saved ? "restored" : "fresh"} strategy={strategy} saved={saved} storageKey={key} />
}

/**
 * Strategy form: the visual rule builder plus name, capital and fee. Creates a new strategy, or
 * edits `strategy` when given. The builder edits a node graph; every complete chain
 * (price → 1–3 conditions → amount → action) is one rule, and rules and conditions can't
 * contradict each other (`findConflicts`). Saved on the server, subject to the plan quota.
 */
function StrategyEditor({ strategy, saved, storageKey }: { strategy?: Strategy; saved: Draft | null; storageKey: string }) {
  const router = useRouter()
  const { locale, t, href } = useI18n()
  const editing = strategy !== undefined
  const { data: strategies } = useStrategies()
  const [details, setDetails] = useState<Details>(() => saved?.details ?? detailsOf(strategy))
  const [graph, setGraph] = useState<Graph>(() => saved?.graph ?? rulesToGraph(strategy?.rules ?? []))
  const [baseline] = useState(() => encode({ details: detailsOf(strategy), graph: rulesToGraph(strategy?.rules ?? []) }))
  const [leaving, setLeaving] = useState<string | null>(null)
  const allowLeave = useRef(false)
  const skipUnloadPrompt = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { rules, incomplete, parts } = useMemo(() => graphToRules(graph), [graph])
  const draft: StrategyDraft = useMemo(() => ({ ...details, rules }), [details, rules])

  const errors = useMemo(() => {
    const own = (strategies ?? []).filter((s) => s.id !== strategy?.id).map((s) => s.name)
    const taken = [...presetNames, ...own]
    return validateStrategy(draft, taken, locale)
  }, [draft, strategies, strategy?.id, locale])

  // Graph-level problems the rule validation can't see.
  const graphProblems = useMemo(() => {
    const problems: string[] = []
    if (incomplete.length > 0)
      problems.push(
        t(
          "Hay nodos sin conectar. Cada regla es una cadena: Precio → condición (Y condición) → cantidad → compra o venta.",
          "Some nodes aren't connected. Each rule is a chain: Price → condition (AND condition) → amount → buy or sell."
        )
      )
    if (rules.some((r) => r.side === "sell" && r.size.unit !== "pct"))
      problems.push(t("La cantidad de una venta debe ser un porcentaje.", "A sell amount must be a percentage."))
    return problems
  }, [incomplete.length, rules, t])

  // Node-level feedback for the canvas: conflicts always, missing data after a save attempt.
  const { invalid, dashed, nodeErrors } = useMemo(() => {
    const invalid = new Set<string>()
    const nodeErrors = new Map<string, Record<string, string>>()
    for (const rule of rules) {
      const part = parts.get(rule.id)
      const ruleErrors = errors.rules[rule.id]
      if (!part || !ruleErrors) continue
      const nodes = [...part.conditions, part.amount, rule.id]
      if (ruleErrors.conflicts.length > 0) nodes.forEach((id) => invalid.add(id))
      if (!submitted) continue
      part.conditions.forEach((id, i) => {
        const fields = ruleErrors.conditions[i]
        if (fields && Object.keys(fields).length > 0) {
          invalid.add(id)
          nodeErrors.set(id, fields)
        }
      })
      const sellInUsdt = rule.side === "sell" && rule.size.unit !== "pct"
      const size = ruleErrors.size ?? (sellInUsdt ? t("En una venta solo se admite %.", "A sell only accepts %.") : undefined)
      if (size) {
        invalid.add(part.amount)
        nodeErrors.set(part.amount, { size })
      }
    }
    return { invalid, dashed: new Set(submitted ? incomplete : []), nodeErrors }
  }, [rules, parts, errors.rules, incomplete, submitted, t])

  const buy = rules.filter((r) => r.side === "buy")
  const sell = rules.filter((r) => r.side === "sell")

  const dirty = useMemo(() => encode({ details, graph }) !== baseline, [details, graph, baseline])

  // Keep the draft while there are changes and drop it when the editor goes away (navigating off,
  // saving, discarding). A language switch reloads the page without unmounting, so it survives.
  // (Nothing is removed on mount: the parent reads the saved draft after this effect has run.)
  const wasDirty = useRef(false)
  useEffect(() => {
    try {
      if (allowLeave.current) return
      if (dirty) {
        sessionStorage.setItem(storageKey, encode({ details, graph }))
        wasDirty.current = true
      } else if (wasDirty.current) {
        sessionStorage.removeItem(storageKey)
        wasDirty.current = false
      }
    } catch {
      /* storage unavailable: the draft just isn't kept */
    }
  }, [dirty, details, graph, storageKey])
  useEffect(
    () => () => {
      try {
        sessionStorage.removeItem(storageKey)
      } catch {
        /* storage unavailable */
      }
    },
    [storageKey]
  )

  // Leaving with unsaved changes asks first: links inside the app open the pop-up, closing or
  // reloading the tab gets the browser's own prompt. The language switch keeps the draft, so it passes.
  useEffect(() => {
    if (!dirty) return
    allowLeave.current = false
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as HTMLElement | null)?.closest("a")
      if (!anchor || allowLeave.current) return
      if (anchor.hasAttribute("hreflang")) {
        skipUnloadPrompt.current = true
        return
      }
      if (anchor.target && anchor.target !== "_self") return
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin || url.pathname + url.search === location.pathname + location.search) return
      event.preventDefault()
      event.stopPropagation()
      setLeaving(url.pathname + url.search + url.hash)
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!allowLeave.current && !skipUnloadPrompt.current) event.preventDefault()
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("beforeunload", onUnload)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [dirty])

  const discard = () => {
    if (leaving === null) return
    allowLeave.current = true
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* storage unavailable */
    }
    // The page can stay mounted (hidden) after navigating away: reset it so it neither shows nor re-saves the draft.
    setDetails(detailsOf(strategy))
    setGraph(rulesToGraph(strategy?.rules ?? []))
    router.push(leaving)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setSaveError(null)
    if (hasErrors(errors) || graphProblems.length > 0) return
    setSaving(true)
    try {
      await saveStrategy(draft, strategy?.id)
      allowLeave.current = true
      router.push(href("/strategies"))
    } catch (error) {
      setSaveError(describeWebError(error, locale, t("No se pudo guardar la estrategia.", "Couldn't save the strategy.")))
      setSaving(false)
    }
  }

  // Conflicts show as soon as they appear; missing data only after a save attempt.
  const blocking = [
    ...(submitted ? [...errors.general, ...graphProblems] : []),
    ...new Set(Object.values(errors.rules).flatMap((r) => r.conflicts)),
  ]

  return (
    <form
      noValidate
      onSubmit={submit}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--container-aside)] lg:items-start lg:gap-8"
    >
      <div className="min-w-0">
        <StrategyBuilder graph={graph} onChange={setGraph} invalid={invalid} dashed={dashed} nodeErrors={nodeErrors} />
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("Información", "Details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field
              label={t("Nombre de la estrategia", "Strategy name")}
              htmlFor="name"
              className="col-span-2"
              hint={
                <FieldError show={submitted} error={errors.name}>
                  {t(
                    "Debe ser único: no puede haber dos estrategias con el mismo nombre.",
                    "Must be unique: two strategies can't share a name."
                  )}
                </FieldError>
              }
            >
              <Input
                id="name"
                name="name"
                placeholder={t("Ej. RSI con filtro de volumen", "E.g. RSI with volume filter")}
                value={details.name}
                onChange={(event) => setDetails((d) => ({ ...d, name: event.target.value }))}
                autoComplete="off"
                maxLength={80}
              />
            </Field>
            <Field
              label={t("Capital inicial", "Initial capital")}
              htmlFor="capital"
              hint={<FieldError show={submitted} error={errors.initialCapital} />}
            >
              <NumberInput
                id="capital"
                suffix="USDT"
                value={details.initialCapital}
                onValue={(initialCapital) => setDetails((d) => ({ ...d, initialCapital }))}
              />
            </Field>
            <Field
              label={t("Comisión por orden", "Fee per order")}
              htmlFor="fee"
              hint={
                <FieldError show={submitted} error={errors.feePct}>
                  {t("Binance spot cobra un 0,1 %.", "Binance spot charges 0.1%.")}
                </FieldError>
              }
            >
              <NumberInput
                id="fee"
                suffix="%"
                step={0.01}
                value={details.feePct}
                onValue={(feePct) => setDetails((d) => ({ ...d, feePct }))}
              />
            </Field>
            <Field
              label={t("Temporalidad recomendada (opcional)", "Recommended timeframe (optional)")}
              htmlFor="rec-timeframe"
              className="col-span-2"
              hint={t("Se muestra al elegir la estrategia en un activo.", "Shown when the strategy is picked on an asset.")}
            >
              <Select
                id="rec-timeframe"
                name="rec-timeframe"
                value={details.recommendedTimeframe ?? ""}
                onChange={(event) =>
                  setDetails((d) => ({ ...d, recommendedTimeframe: (event.target.value || undefined) as Timeframe | undefined }))
                }
              >
                <option value="">{t("Sin recomendación", "No recommendation")}</option>
                {timeframes.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("Periodo recomendado (opcional)", "Recommended period (optional)")}
              htmlFor="rec-range"
              className="col-span-2"
              hint={t("Rango de fechas con el que mejor funciona.", "Date range it works best with.")}
            >
              <Select
                id="rec-range"
                name="rec-range"
                value={details.recommendedRange ?? ""}
                onChange={(event) =>
                  setDetails((d) => ({ ...d, recommendedRange: (event.target.value || undefined) as RangePreset | undefined }))
                }
              >
                <option value="">{t("Sin recomendación", "No recommendation")}</option>
                {rangePresets.map((r) => (
                  <option key={r} value={r}>
                    {rangePresetLabels[locale][r]}
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Resumen", "Summary")}</CardTitle>
            <Badge variant={editing ? "primary" : "default"}>{editing ? t("Editando", "Editing") : t("Borrador", "Draft")}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-up-soft px-3 py-2.5">
                <dt className="text-caption text-muted-foreground">{t("Compra", "Buy")}</dt>
                <dd className="num text-title font-bold text-up">
                  {buy.length} {buy.length === 1 ? t("regla", "rule") : t("reglas", "rules")}
                </dd>
              </div>
              <div className="rounded-lg bg-down-soft px-3 py-2.5">
                <dt className="text-caption text-muted-foreground">{t("Venta", "Sell")}</dt>
                <dd className="num text-title font-bold text-down">
                  {sell.length} {sell.length === 1 ? t("regla", "rule") : t("reglas", "rules")}
                </dd>
              </div>
            </dl>
            {blocking.length > 0 && (
              <ul className="flex flex-col gap-2 rounded-lg bg-down-soft px-3 py-2.5 text-caption text-down">
                {blocking.map((message) => (
                  <li key={message} className="flex items-start gap-2">
                    <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                    {message}
                  </li>
                ))}
              </ul>
            )}
            {saveError && (
              <div className="flex flex-col gap-2">
                <p className="text-caption font-semibold text-down">{saveError}</p>
                <LimitCta />
              </div>
            )}
          </CardContent>
          <footer className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end md:px-5 lg:flex-col-reverse xl:flex-row">
            <Link href={href("/strategies")} className={buttonVariants({ variant: "outline", size: "lg" })}>
              {t("Cancelar", "Cancel")}
            </Link>
            <Button type="submit" size="lg" disabled={saving || !strategies}>
              <SaveIcon data-icon="inline-start" />
              {editing ? t("Guardar cambios", "Save changes") : t("Guardar estrategia", "Save strategy")}
            </Button>
          </footer>
        </Card>
      </aside>

      <ConfirmDialog
        open={leaving !== null}
        onOpenChange={(open) => !open && setLeaving(null)}
        title={t("¿Salir de la edición?", "Leave the editor?")}
        description={t(
          "Tienes cambios sin guardar. Puedes seguir editando o descartarlos y salir.",
          "You have unsaved changes. You can keep editing, or discard them and leave."
        )}
        cancelLabel={t("Seguir editando", "Keep editing")}
        confirmLabel={t("Descartar y salir", "Discard and leave")}
        onConfirm={discard}
      />
    </form>
  )
}

export { StrategyForm }
