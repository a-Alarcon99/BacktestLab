import { Badge } from "@/components/ui/badge"
import {
  biasLabel,
  candlePatterns,
  patternById,
  type CandlePattern,
  type PatternBias,
  type PatternId,
} from "@/lib/candle-patterns"
import { cn } from "@/lib/utils"

const SLOT = 22
const BODY = 10
const HEIGHT = 100
const PAD = 4

/** Schematic candles of a pattern: green = bullish, red = bearish, wicks and bodies to scale. */
function PatternIllustration({ pattern, className }: { pattern: CandlePattern; className?: string }) {
  const width = pattern.candles.length * SLOT + PAD * 2
  const y = (value: number) => PAD + ((100 - value) / 100) * (HEIGHT - PAD * 2)
  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={`Esquema de ${pattern.name}: ${pattern.candles.length} ${pattern.candles.length === 1 ? "vela" : "velas"}`}
      className={cn("h-16 w-auto shrink-0", className)}
    >
      {pattern.candles.map(([open, high, low, close], i) => {
        const x = PAD + i * SLOT + (SLOT - BODY) / 2
        const mid = x + BODY / 2
        const up = close >= open
        const top = y(Math.max(open, close))
        const color = up ? "fill-up stroke-up" : "fill-down stroke-down"
        return (
          <g key={i} className={color} strokeWidth={1.5}>
            <line x1={mid} x2={mid} y1={y(high)} y2={y(low)} />
            <rect x={x} y={top} width={BODY} height={Math.max(y(Math.min(open, close)) - top, 1.5)} rx={1} />
          </g>
        )
      })}
    </svg>
  )
}

/** Radio group of the available patterns, split into bullish and bearish, each with its sketch. */
function CandlePatternPicker({
  id,
  value,
  onChange,
}: {
  id: string
  value: PatternId
  onChange: (pattern: PatternId) => void
}) {
  const selected = patternById[value]
  return (
    <div className="flex flex-col gap-3 sm:col-span-2 xl:col-span-4">
      {(["bullish", "bearish"] as PatternBias[]).map((bias) => (
        <div key={bias} role="radiogroup" aria-label={`Patrones ${biasLabel[bias].toLowerCase()}s`} className="flex flex-col gap-2">
          <span className="text-caption font-semibold text-muted-foreground">
            Patrones {biasLabel[bias].toLowerCase()}s
          </span>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {candlePatterns
              .filter((p) => p.bias === bias)
              .map((pattern) => {
                const active = pattern.id === value
                return (
                  <button
                    key={pattern.id}
                    id={`${id}-${pattern.id}`}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange(pattern.id as PatternId)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                      active ? "border-primary bg-accent/50" : "hover:border-primary/60 hover:bg-accent/30"
                    )}
                  >
                    <PatternIllustration pattern={pattern} className="w-14" />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {pattern.name}
                        <Badge variant={bias === "bullish" ? "up" : "down"}>{biasLabel[bias]}</Badge>
                      </span>
                      <span className="text-caption text-muted-foreground">{pattern.description}</span>
                    </span>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
      <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-caption text-muted-foreground">
        <span className="font-semibold">{selected.name}:</span> {selected.rule} Se evalúa al cierre de la última vela
        del patrón.
      </p>
    </div>
  )
}

export { CandlePatternPicker, PatternIllustration }
