import { MAX_BACKTESTS, type BacktestRecord } from "@/lib/backtests"
import { getMe, useMe } from "@/lib/session"
import { webFetch } from "@/lib/web-api"
import { createLocalStore, isObject, parseList } from "./local-store"

// Backtest history repository: only the last MAX_BACKTESTS runs are kept.

function isRecord(item: unknown): item is BacktestRecord {
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

const store = createLocalStore<BacktestRecord[]>("backtestlab:backtests:v1", parseList(isRecord), [])

/** Runs kept: the plan's history size (the server decides the plan; this is display retention). */
function historyLimit(plan: { historySize: number } | undefined) {
  return plan?.historySize ?? MAX_BACKTESTS
}

/** Most recent runs first, at most as many as the plan keeps. */
export function useRecentBacktests() {
  const stored = store.useValue()
  const me = useMe()
  const limit = historyLimit(me?.plan)
  const data = stored === undefined || me === undefined ? undefined : stored.slice(0, limit)
  return { data, isLoading: data === undefined, limit }
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
    const { symbol, timeframe, from, to, strategy } = record
    // Best effort: failing to tell the server never restores anything.
    await webFetch("/api/backtests/forget", {
      method: "POST",
      body: JSON.stringify({ symbol, timeframe, from, to, strategy }),
    }).catch(() => {})
  }
  store.write(store.read().filter((b) => b.id !== id))
}

export async function addBacktest(record: BacktestRecord): Promise<void> {
  store.write([record, ...store.read()].slice(0, historyLimit(getMe()?.plan)))
}
