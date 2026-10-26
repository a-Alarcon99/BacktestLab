import { isBatchRecord, isRobustRecord, isSingleRecord, MAX_BACKTESTS, requestOfRobust, type BatchRecord, type HistoryRecord, type RobustRecord } from "@/lib/backtests"
import { getMe, useMe } from "@/lib/session"
import { webFetch } from "@/lib/web-api"
import { createLocalStore, isObject, parseList } from "./local-store"

// Backtest history repository: only the last MAX_BACKTESTS runs are kept.

function isBatch(item: unknown): item is BatchRecord {
  return (
    isObject(item) &&
    item.kind === "batch" &&
    typeof item.id === "string" &&
    typeof item.executedAt === "string" &&
    isObject(item.strategy) &&
    Array.isArray(item.symbols) &&
    item.symbols.every((s) => typeof s === "string") &&
    Array.isArray(item.items) &&
    item.items.every((i) => isObject(i) && typeof i.symbol === "string" && Array.isArray(i.equity))
  )
}

function isRobust(item: unknown): item is RobustRecord {
  return (
    isObject(item) &&
    item.kind === "robust" &&
    (item.test === "windows" || item.test === "sensitivity" || item.test === "timeframes") &&
    typeof item.id === "string" &&
    typeof item.executedAt === "string" &&
    typeof item.symbol === "string" &&
    typeof item.score === "number" &&
    isObject(item.strategy) &&
    isObject(item.options) &&
    Array.isArray(item.curve)
  )
}

function isRecord(item: unknown): item is HistoryRecord {
  if (isBatch(item) || isRobust(item)) return true
  return (
    isObject(item) &&
    (item.schemaVersion === 1 || item.schemaVersion === 2) &&
    typeof item.id === "string" &&
    typeof item.symbol === "string" &&
    isObject(item.strategy) &&
    isObject(item.stats) &&
    Array.isArray(item.equity)
  )
}

const store = createLocalStore<HistoryRecord[]>("backtestlab:backtests:v1", parseList(isRecord), [])

/** Runs kept: the plan's history size (the server decides the plan; this is display retention). */
function historyLimit(plan: { historySize: number } | undefined) {
  return plan?.historySize ?? MAX_BACKTESTS
}

/**
 * Most recent entries first (single runs and multi-asset groups; each group counts as one), at
 * most as many as the plan keeps.
 */
export function useHistory() {
  const stored = store.useValue()
  const me = useMe()
  const limit = historyLimit(me?.plan)
  const data = stored === undefined || me === undefined ? undefined : stored.slice(0, limit)
  return { data, isLoading: data === undefined, limit }
}

/** The single-asset runs of the history (what per-asset lists and the previous-run comparison use). */
export function useRecentBacktests() {
  const { data, isLoading, limit } = useHistory()
  return { data: data?.filter(isSingleRecord), isLoading, limit }
}

/** Forgets the runs saved in this browser (on sign-out, so the next person doesn't see them). */
export function clearBacktestHistory() {
  store.write([])
}

/**
 * Removes the run from the history. The quota it consumed is not given back: the server only
 * stops treating it as a free re-run.
 */
export async function deleteBacktest(id: string): Promise<void> {
  const record = store.read().find((b) => b.id === id)
  if (record) {
    const { timeframe, from, to, strategy } = record
    const body = isRobustRecord(record)
      ? requestOfRobust(record)
      : isBatchRecord(record)
        ? { kind: "assets", symbols: record.symbols, timeframe, from, to, strategy }
        : { symbol: record.symbol, timeframe, from, to, strategy }
    // Best effort: failing to tell the server never restores anything.
    await webFetch("/api/backtests/forget", { method: "POST", body: JSON.stringify(body) }).catch(() => {})
  }
  store.write(store.read().filter((b) => b.id !== id))
}

export async function addBacktest(record: HistoryRecord): Promise<void> {
  store.write([record, ...store.read()].slice(0, historyLimit(getMe()?.plan)))
}
