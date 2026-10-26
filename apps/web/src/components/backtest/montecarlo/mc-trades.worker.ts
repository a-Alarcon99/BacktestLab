import { resampleTrades, type ResampleInput } from "@/lib/monte-carlo"

// Mixes the trades of a backtest off the main thread: the page keeps animating while thousands of
// alternative histories are computed. It talks to nobody: the trades come in, the summary goes out.

const scope = self as unknown as { onmessage: ((event: MessageEvent<ResampleInput>) => void) | null; postMessage: (data: unknown) => void }

scope.onmessage = (event) => {
  scope.postMessage(resampleTrades(event.data))
}
