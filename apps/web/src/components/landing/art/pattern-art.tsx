"use client"

import { useEffect, useRef, useState } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { biasLabel, patternById, type CandlePattern, type PatternId, type SchematicCandle } from "@/lib/candle-patterns"
import { extent, linear } from "@/lib/chart-geometry"
import { cn } from "@/lib/utils"
import { useShouldPlay } from "@/lib/motion"

// M2 · Candlestick patterns: a short trend draws in, then the pattern's candles, and the candle
// that completes it lights up with its name (detection happens at its close: no look-ahead).

const SHOWN: PatternId[] = ["hammer", "bullish-engulfing", "morning-star", "shooting-star", "evening-star"]
const EVERY = 3.4
const W = 220
const H = 120
const SLOT = 26

/** Three candles of the trend the pattern reverses, leading into its first candle. */
function withContext(pattern: CandlePattern): { candles: SchematicCandle[]; first: number } {
  const open = pattern.candles[0][0]
  const sign = pattern.bias === "bullish" ? 1 : -1
  const context = [0, 1, 2].map((j): SchematicCandle => {
    const o = open + sign * ((3 - j) * 9 + 3)
    const c = o - sign * 8
    return [o, Math.max(o, c) + 3, Math.min(o, c) - 3, c]
  })
  return { candles: [...context, ...pattern.candles], first: context.length }
}

function PatternArt() {
  const { locale, t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const { play, reduced } = useShouldPlay(ref)
  const [index, setIndex] = useState(0)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    if (!play || pinned) return
    const id = setInterval(() => setIndex((i) => (i + 1) % SHOWN.length), EVERY * 1000)
    return () => clearInterval(id)
  }, [play, pinned])

  const pattern = patternById[SHOWN[index]]
  const { candles, first } = withContext(pattern)
  const [lo, hi] = extent(candles.flatMap((c) => [c[1], c[2]]))
  const y = linear(lo - 4, hi + 4, H - 8, 8)
  const x0 = (W - candles.length * SLOT) / 2
  const last = candles.length - 1
  const lastX = x0 + last * SLOT + SLOT / 2
  const lastDelay = 0.12 * last + 0.25

  return (
    <div ref={ref} data-paused={play ? "false" : "true"} className="flex flex-col gap-3">
      <svg key={index} viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label={pattern.name[locale]}>
        <rect
          className="lp-anim lp-box"
          x={lastX - SLOT / 2 + 2}
          y={y(candles[last][1]) - 6}
          width={SLOT - 4}
          height={y(candles[last][2]) - y(candles[last][1]) + 12}
          rx={7}
          fill="var(--primary)"
          fillOpacity={0.1}
          stroke="var(--primary)"
          strokeOpacity={0.6}
          style={{ animation: `lp-pop .5s cubic-bezier(.22,1,.36,1) ${lastDelay}s both` }}
        />
        {candles.map(([open, high, low, close], i) => {
          const cx = x0 + i * SLOT + SLOT / 2
          const up = close >= open
          const top = y(Math.max(open, close))
          return (
            <g
              key={i}
              className={cn("lp-anim lp-box", up ? "fill-up stroke-up" : "fill-down stroke-down")}
              opacity={i < first ? 0.4 : 1}
              style={{ animation: `lp-rise .45s cubic-bezier(.22,1,.36,1) ${0.12 * i}s both` }}
            >
              <line x1={cx} x2={cx} y1={y(high)} y2={y(low)} strokeWidth={1.5} />
              <rect x={cx - 6} y={top} width={12} height={Math.max(y(Math.min(open, close)) - top, 2)} rx={1.5} stroke="none" />
            </g>
          )
        })}
      </svg>
      <div
        key={`name-${index}`}
        className="lp-anim flex items-center justify-center gap-2"
        style={{ animation: `lp-fade-in .4s ease ${lastDelay}s both` }}
      >
        <span className="font-semibold">{pattern.name[locale]}</span>
        <Badge variant={pattern.bias === "bullish" ? "up" : "down"}>{biasLabel[pattern.bias][locale]}</Badge>
      </div>
      <div className="flex justify-center gap-1.5" role="group" aria-label={t("Patrones", "Patterns")}>
        {SHOWN.map((id, i) => (
          <button
            key={id}
            type="button"
            aria-label={patternById[id].name[locale]}
            aria-pressed={i === index}
            onClick={() => {
              setIndex(i)
              setPinned(true)
            }}
            className={cn(
              "h-1.5 rounded-full transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
              i === index ? "w-5 bg-primary" : "w-1.5 bg-border-strong hover:bg-muted-foreground"
            )}
          />
        ))}
      </div>
      {reduced && <span className="sr-only">{pattern.description[locale]}</span>}
    </div>
  )
}

export { PatternArt }
