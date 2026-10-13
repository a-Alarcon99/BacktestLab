import { useSyncExternalStore } from "react"

// The only module that touches localStorage. Data lives per browser: it can be missing or
// blocked (private mode, cleared site data), so every access is guarded and falls back.

export class StorageError extends Error {}

/**
 * A JSON value in localStorage under a versioned `key`, shared by every component through
 * `useValue()` and kept in sync across tabs. `parse` validates what was stored (data written by
 * an older version or edited by hand) and drops what it doesn't understand.
 */
export function createLocalStore<T>(key: string, parse: (raw: unknown) => T, fallback: T) {
  let cache: { raw: string | null; value: T } | undefined
  const listeners = new Set<() => void>()

  function read(): T {
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {}
    // Same string -> same object, as useSyncExternalStore requires.
    if (cache?.raw === raw) return cache.value
    let value = fallback
    try {
      if (raw !== null) value = parse(JSON.parse(raw))
    } catch {}
    cache = { raw, value }
    return value
  }

  function write(value: T) {
    const raw = JSON.stringify(value)
    try {
      window.localStorage.setItem(key, raw)
    } catch {
      throw new StorageError("No se pudo guardar en este navegador (almacenamiento lleno o bloqueado).")
    }
    cache = { raw, value }
    listeners.forEach((listener) => listener())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener()
    }
    window.addEventListener("storage", onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener("storage", onStorage)
    }
  }

  /** `undefined` on the server and during hydration: render a placeholder until then. */
  function useValue(): T | undefined {
    return useSyncExternalStore<T | undefined>(subscribe, read, () => undefined)
  }

  return { read, write, useValue }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Keeps the array items accepted by `guard`; anything else becomes an empty list. */
export function parseList<T>(guard: (item: unknown) => item is T) {
  return (raw: unknown): T[] => (Array.isArray(raw) ? raw.filter(guard) : [])
}
