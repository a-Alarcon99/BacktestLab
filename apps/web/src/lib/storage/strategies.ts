import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useLocale } from "@/components/i18n/locale-provider"
import { getPreset, isPreset, presetStrategiesFor } from "@/lib/preset-strategies"
import { getMe, meScope, refreshMe, subscribeMe } from "@/lib/session"
import type { Strategy, StrategyDraft } from "@/lib/strategy"
import { webFetch } from "@/lib/web-api"

// Strategies repository, backed by the server (`/api/strategies`): they belong to the account (or
// to the guest cookie) and the server enforces the creation quota. Same `{ data, isLoading }` /
// Promise-mutation shape the components already use.

let data: Strategy[] | undefined
let loadedScope: string | undefined
let inflight: Promise<void> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function load(): Promise<void> {
  inflight ??= webFetch<Strategy[]>("/api/strategies", { cache: "no-store" })
    .then((list) => {
      data = list
      loadedScope = meScope(getMe())
      emit()
    })
    .catch(() => {
      data ??= []
      emit()
    })
    .finally(() => {
      inflight = undefined
    })
  return inflight
}

/** Re-reads the list when the visitor changes identity (sign-in / sign-out). */
function onSessionChange() {
  const scope = meScope(getMe())
  if (scope !== undefined && scope !== loadedScope) {
    data = undefined
    emit()
    void load()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const stop = subscribeMe(onSessionChange)
  return () => {
    listeners.delete(listener)
    stop()
  }
}

/** The user's strategies, most recently updated first. */
export function useStrategies() {
  const value = useSyncExternalStore(subscribe, () => data, () => undefined)
  useEffect(() => {
    if (data === undefined) void load()
  }, [])
  return { data: value, isLoading: value === undefined }
}

/** Built-in presets followed by the user's strategies: everything a backtest can run. */
export function useRunnableStrategies() {
  const { data } = useStrategies()
  const locale = useLocale()
  const all = useMemo(() => (data ? [...presetStrategiesFor(locale), ...data] : undefined), [data, locale])
  return { data: all, isLoading: all === undefined }
}

/** `null` when it doesn't exist. Presets are found too (read-only). */
export function useStrategy(id: string) {
  const { data, isLoading } = useStrategies()
  const locale = useLocale()
  const strategy = useMemo(
    () => getPreset(id, locale) ?? (data ? (data.find((s) => s.id === id) ?? null) : undefined),
    [data, id, locale]
  )
  return { data: strategy, isLoading }
}

const body = (draft: StrategyDraft) =>
  JSON.stringify({
    name: draft.name.trim(),
    initialCapital: draft.initialCapital,
    feePct: draft.feePct,
    rules: draft.rules,
    recommendedTimeframe: draft.recommendedTimeframe,
    recommendedRange: draft.recommendedRange,
  })

/**
 * Creates the strategy (consumes quota; rejects with the server's message when the limit is
 * reached), or updates it when `id` is given. Names must be unique.
 */
export async function saveStrategy(draft: StrategyDraft, id?: string): Promise<Strategy> {
  if (id && isPreset(id)) throw new Error("Las estrategias predefinidas no se pueden modificar.")
  const saved = id
    ? await webFetch<Strategy>(`/api/strategies/${encodeURIComponent(id)}`, { method: "PUT", body: body(draft) })
    : await webFetch<Strategy>("/api/strategies", { method: "POST", body: body(draft) })
  data = [saved, ...(data ?? []).filter((s) => s.id !== saved.id)]
  emit()
  void refreshMe()
  return saved
}

/** Removes the strategy. The quota it consumed is not given back. */
export async function deleteStrategy(id: string): Promise<void> {
  if (isPreset(id)) return
  await webFetch<void>(`/api/strategies/${encodeURIComponent(id)}`, { method: "DELETE" })
  data = (data ?? []).filter((s) => s.id !== id)
  emit()
  void refreshMe()
}
