import { useMemo } from "react"
import { getPreset, presetStrategies } from "@/lib/preset-strategies"
import type { Strategy, StrategyDraft } from "@/lib/strategy"
import { createLocalStore, isObject, parseList } from "./local-store"

// Strategies repository. Async-shaped API (`{ data, isLoading }`, Promise mutations) so it can
// move to the database behind a login without touching the components.

function isStrategy(item: unknown): item is Strategy {
  return (
    isObject(item) &&
    item.schemaVersion === 1 &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.initialCapital === "number" &&
    typeof item.feePct === "number" &&
    Array.isArray(item.rules) &&
    typeof item.updatedAt === "string"
  )
}

const store = createLocalStore<Strategy[]>("backtestlab:strategies:v1", parseList(isStrategy), [])

/** The user's strategies, most recently updated first. */
export function useStrategies() {
  const data = store.useValue()
  return { data, isLoading: data === undefined }
}

/** Built-in presets followed by the user's strategies: everything a backtest can run. */
export function useRunnableStrategies() {
  const { data } = useStrategies()
  const all = useMemo(() => (data ? [...presetStrategies, ...data] : undefined), [data])
  return { data: all, isLoading: all === undefined }
}

/** `null` when it doesn't exist. Presets are found too (read-only). */
export function useStrategy(id: string) {
  const { data, isLoading } = useStrategies()
  const strategy = useMemo(
    () => getPreset(id) ?? (data ? (data.find((s) => s.id === id) ?? null) : undefined),
    [data, id]
  )
  return { data: strategy, isLoading }
}

/** Creates the strategy, or updates it when `id` is given. Names must be unique. */
export async function saveStrategy(draft: StrategyDraft, id?: string): Promise<Strategy> {
  const strategies = store.read()
  const name = draft.name.trim()
  if (id && getPreset(id)) throw new Error("Las estrategias predefinidas no se pueden modificar.")
  const taken = [...presetStrategies, ...strategies.filter((s) => s.id !== id)]
  if (taken.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error("Ya tienes una estrategia con este nombre.")
  }
  const now = new Date().toISOString()
  const previous = id ? strategies.find((s) => s.id === id) : undefined
  const strategy: Strategy = {
    schemaVersion: 1,
    id: previous?.id ?? crypto.randomUUID(),
    name,
    initialCapital: draft.initialCapital,
    feePct: draft.feePct,
    rules: draft.rules,
    recommendedTimeframe: draft.recommendedTimeframe,
    recommendedRange: draft.recommendedRange,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
  store.write([strategy, ...strategies.filter((s) => s.id !== strategy.id)])
  return strategy
}

export async function deleteStrategy(id: string): Promise<void> {
  if (getPreset(id)) return
  store.write(store.read().filter((s) => s.id !== id))
}
