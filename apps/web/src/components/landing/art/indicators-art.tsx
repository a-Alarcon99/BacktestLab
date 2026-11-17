// Static sketch of the indicators card: price with a moving average over it, and an RSI panel
// with its 30/70 bands underneath. Decorative: the chips of the card name the indicators.

const PRICE = "M0 52 L18 46 L36 50 L54 38 L72 42 L90 28 L108 34 L126 20 L144 26 L162 14 L180 22 L198 12"
const AVERAGE = "M0 50 C36 48 72 42 108 36 S170 22 198 18"
const RSI = "M0 22 L18 18 L36 24 L54 12 L72 16 L90 8 L108 14 L126 26 L144 20 L162 10 L180 16 L198 6"

function IndicatorsArt() {
  return (
    <svg viewBox="0 0 200 120" className="h-32 w-full" aria-hidden>
      <path d={PRICE} transform="translate(0 2)" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" className="text-foreground/70" />
      <path d={AVERAGE} transform="translate(0 2)" fill="none" stroke="currentColor" strokeWidth="1.75" strokeDasharray="4 3" className="text-primary" />
      <g transform="translate(0 70)">
        <rect x="0" y="0" width="198" height="40" rx="4" className="fill-muted/60" />
        <line x1="0" y1="10" x2="198" y2="10" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" className="text-down/60" />
        <line x1="0" y1="30" x2="198" y2="30" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" className="text-up/60" />
        <path d={RSI} transform="translate(0 6)" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" className="text-chart-3" />
      </g>
    </svg>
  )
}

export { IndicatorsArt }
