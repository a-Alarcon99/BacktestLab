"use client"

import { useEffect, useState } from "react"
import { resampleTrades, type McSummary, type ResampleInput } from "@/lib/monte-carlo"

/**
 * Mixes the trades in a Web Worker (0 requests, nothing leaves the browser). If workers are not
 * available, or fail to start, it computes on the main thread after yielding to the page once.
 * `input` must be referentially stable; `null` computes nothing. Returns `undefined` while working.
 */
export function useTradesMonteCarlo(input: ResampleInput | null): McSummary | undefined | "failed" {
  const [done, setDone] = useState<{ input: ResampleInput; summary: McSummary | "failed" } | null>(null)

  useEffect(() => {
    if (!input) return
    let cancelled = false
    const finish = (summary: McSummary | "failed") => {
      if (!cancelled) setDone({ input, summary })
    }
    const onMain = () => {
      setTimeout(() => {
        try {
          finish(resampleTrades(input))
        } catch {
          finish("failed")
        }
      }, 0)
    }
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL("./mc-trades.worker.ts", import.meta.url), { type: "module" })
      worker.onmessage = (event: MessageEvent<McSummary>) => finish(event.data)
      worker.onerror = () => {
        worker?.terminate()
        worker = null
        onMain()
      }
      worker.postMessage(input)
    } catch {
      worker = null
      onMain()
    }
    return () => {
      cancelled = true
      worker?.terminate()
    }
  }, [input])

  return done !== null && done.input === input ? done.summary : undefined
}
