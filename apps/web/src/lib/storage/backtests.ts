import { MAX_BACKTESTS, type BacktestRecord } from "@/lib/backtests"
import { createLocalStore, isObject, parseList } from "./local-store"

// Backtest history repository: only the last MAX_BACKTESTS runs are kept.

function isRecord(item: unknown): item is BacktestRecord {
  return (
    isObject(item) &&
    item.schemaVersion === 1 &&
    typeof item.id === "string" &&
    typeof item.symbol === "string" &&
    isObject(item.strategy) &&
    isObject(item.stats) &&
    Array.isArray(item.equity)
  )
}

const store = createLocalStore<BacktestRecord[]>("backtestlab:backtests:v1", parseList(isRecord), [])

/** Most recent runs first. */
export function useRecentBacktests() {
  const data = store.useValue()
  return { data, isLoading: data === undefined }
}

export async function addBacktest(record: BacktestRecord): Promise<void> {
  store.write([record, ...store.read()].slice(0, MAX_BACKTESTS))
}
