"use client"

import { Button } from "@/components/ui/button"

/**
 * Takes the visitor to the backtest card and focuses its first control. A plain `#backtest` link
 * does nothing visible on desktop, where the card is already on screen next to the sticky panel.
 */
function GoToBacktestButton({ children }: { children: React.ReactNode }) {
  return (
    <Button
      type="button"
      size="lg"
      variant="soft"
      className="flex-1"
      onClick={() => {
        const card = document.getElementById("backtest")
        if (!card) return
        card.scrollIntoView({ behavior: "smooth", block: "start" })
        card.querySelector<HTMLElement>("button, input, select")?.focus({ preventScroll: true })
      }}
    >
      {children}
    </Button>
  )
}

export { GoToBacktestButton }
