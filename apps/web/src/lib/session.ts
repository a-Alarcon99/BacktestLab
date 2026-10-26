import { useEffect, useSyncExternalStore } from "react"
import { defaultLocale, type Locale } from "@/lib/i18n"

// Who the visitor is (guest or account), their plan limits and usage, as reported by `/api/me`.
// The server is the only authority: this is a display cache, never an enforcement point.

export type Me = {
  user: { id: string; name: string; email: string } | null
  plan: {
    id: string
    name: string
    /** `null` = unlimited. */
    maxStrategies: number | null
    maxBacktestsTotal: number | null
    maxBacktestsPerDay: number | null
    historySize: number
    /** Assets one multi-asset run may include (1 = not allowed). */
    maxBatchItems: number
    /** Synthetic paths one Monte Carlo run may simulate (0 = not allowed). */
    maxMcPaths: number
    /** ISO end of paid access; `null` when the plan doesn't expire. */
    expiresAt: string | null
  }
  usage: { strategiesCreated: number; backtestsTotal: number; backtestsToday: number }
}

let current: Me | undefined
let started = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Fetches `/api/me` again and notifies every subscriber. */
export async function refreshMe(): Promise<void> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" })
    if (!res.ok) return
    current = (await res.json()) as Me
    emit()
  } catch {}
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMe(): Me | undefined {
  useEffect(() => {
    if (!started) {
      started = true
      void refreshMe()
    }
  }, [])
  return useSyncExternalStore(subscribe, () => current, () => undefined)
}

export function subscribeMe(listener: () => void) {
  if (!started) {
    started = true
    void refreshMe()
  }
  return subscribe(listener)
}

export const getMe = () => current

/** Identity bucket of the current view: changes on sign-in / sign-out. */
export const meScope = (me: Me | undefined) => (me ? (me.user?.id ?? "guest") : undefined)

/**
 * Backtests left today and in total, whichever runs out first; `null` = unlimited. Display only:
 * a re-run of something already paid for is free, which only the server knows.
 */
export function remainingBacktests(me: Me | undefined): number | null {
  if (!me) return null
  const { plan, usage } = me
  const left = [
    plan.maxBacktestsTotal === null ? null : plan.maxBacktestsTotal - usage.backtestsTotal,
    plan.maxBacktestsPerDay === null ? null : plan.maxBacktestsPerDay - usage.backtestsToday,
  ].filter((n): n is number => n !== null)
  return left.length ? Math.max(0, Math.min(...left)) : null
}

/** "2 de 3" style description of a quota; `null` max = unlimited. */
export function quotaText(used: number, max: number | null, locale: Locale = defaultLocale) {
  return max === null ? `${used}` : `${Math.min(used, max)} ${locale === "en" ? "of" : "de"} ${max}`
}
