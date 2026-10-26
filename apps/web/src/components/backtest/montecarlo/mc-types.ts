import type { Timeframe } from "@/lib/candles"
import type { McMethod } from "@/lib/monte-carlo"
import type { Strategy } from "@/lib/strategy"

type McBase = { symbol: string; timeframe: Timeframe; from: string; to: string; strategy: Strategy; mode: "new" | "review" }

/**
 * A Monte Carlo run. `mc-trades` runs the strategy once on the real candles and then mixes its
 * trades in the browser; `mc-paths` has the engine simulate it on synthetic price paths.
 * It must be referentially stable (kept in state or memoized): a new object starts a new run.
 */
export type McRun =
  | (McBase & { kind: "mc-trades"; method: McMethod; runs: number; seed: number })
  | (McBase & { kind: "mc-paths"; runs: number; blockLength?: number; seed?: number })
