"use client"

import { useRef } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { easeOutCubic, linear, phase } from "@/lib/chart-geometry"
import { ArtFrame, Chip } from "./parts"
import { useLoop } from "./use-loop"

// Signal at a candle's close -> order at the NEXT candle's open (the rule of the engine).

const W = 640
const H = 280
const CYCLE = 9
const REST = 7
const SIGNAL = 3

type Candle = { o: number; h: number; l: number; c: number }
const CANDLES: Candle[] = [
  { o: 52, h: 54, l: 48, c: 49 },
  { o: 49, h: 51, l: 44, c: 45 },
  { o: 45, h: 47, l: 40, c: 43 },
  { o: 43, h: 44, l: 36, c: 38 },
  { o: 41, h: 48, l: 40, c: 46 },
  { o: 46, h: 51, l: 45, c: 50 },
  { o: 50, h: 55, l: 49, c: 54 },
  { o: 54, h: 58, l: 52, c: 57 },
]

const xAt = (i: number) => 60 + i * 74
const y = linear(34, 60, 228, 70)
const BODY = 28

function ExecutionArt() {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const time = useLoop(ref, CYCLE, REST)

  const reveal = (i: number) => phase(time, i <= SIGNAL ? 0.3 * i : 4.4 + 0.25 * (i - SIGNAL - 1), 0.3)
  const ring = phase(time, 2.2, 0.5)
  const hop = easeOutCubic(phase(time, 3.4, 0.9))
  const order = phase(time, 4.3, 0.5)
  const fade = 1 - phase(time, 8.4, 0.5)

  const close = CANDLES[SIGNAL].c
  const open = CANDLES[SIGNAL + 1].o
  const from = { x: xAt(SIGNAL) + BODY / 2 + 4, y: y(close) }
  const to = { x: xAt(SIGNAL + 1) - BODY / 2 - 4, y: y(open) }

  return (
    <ArtFrame
      ref={ref}
      caption={t(
        "Ejemplo ilustrativo. La regla se cumple cuando la vela 4 termina, pero ese precio ya pasó: la compra se hace en el primer precio disponible, la apertura de la vela 5.",
        "Illustrative example. The rule is met when candle 4 ends, but that price is already gone: the buy happens at the first available price, the open of candle 5."
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={t(
          "Ocho velas. La regla se cumple al cierre de la cuarta; la compra se ejecuta en la apertura de la quinta.",
          "Eight candles. The rule is met at the close of the fourth; the buy is executed at the open of the fifth."
        )}
      >
        <g opacity={fade}>
          {CANDLES.map((c, i) => {
            const a = reveal(i)
            const up = c.c >= c.o
            const color = up ? "var(--up)" : "var(--down)"
            return (
              <g key={i} opacity={a}>
                <line x1={xAt(i)} x2={xAt(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={2} strokeLinecap="round" />
                <rect
                  x={xAt(i) - BODY / 2}
                  y={Math.min(y(c.o), y(c.c))}
                  width={BODY}
                  height={Math.max(Math.abs(y(c.o) - y(c.c)), 2)}
                  rx={3}
                  fill={color}
                />
                <text x={xAt(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                  {i + 1}
                </text>
              </g>
            )
          })}

          {ring > 0 && (
            <g opacity={ring}>
              <rect
                x={xAt(SIGNAL) - BODY / 2 - 9}
                y={y(CANDLES[SIGNAL].h) - 9}
                width={BODY + 18}
                height={y(CANDLES[SIGNAL].l) - y(CANDLES[SIGNAL].h) + 18}
                rx={10}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <line
                x1={xAt(SIGNAL) - BODY / 2 - 20}
                x2={xAt(SIGNAL + 1) - BODY / 2 - 4}
                y1={y(close)}
                y2={y(close)}
                stroke="var(--primary)"
                strokeOpacity={0.5}
                strokeDasharray="2 4"
              />
            </g>
          )}

          {hop > 0 && (
            <g>
              <path
                d={`M${from.x} ${from.y}C${from.x + 22} ${from.y} ${to.x - 22} ${to.y} ${to.x} ${to.y}`}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - hop}
              />
              {hop > 0.95 && (
                <polygon
                  points={`${to.x + 2},${to.y} ${to.x - 7},${to.y - 5} ${to.x - 7},${to.y + 5}`}
                  fill="var(--primary)"
                />
              )}
            </g>
          )}

          {order > 0 && (
            <g opacity={order}>
              <circle cx={xAt(SIGNAL + 1) - BODY / 2} cy={y(open)} r={5 + 5 * (1 - order)} fill="var(--up)" stroke="var(--card)" strokeWidth={2} />
              <polygon
                points={`${xAt(SIGNAL + 1)},${y(CANDLES[SIGNAL + 1].l) + 10} ${xAt(SIGNAL + 1) - 7},${y(CANDLES[SIGNAL + 1].l) + 22} ${xAt(SIGNAL + 1) + 7},${y(CANDLES[SIGNAL + 1].l) + 22}`}
                fill="var(--up)"
              />
            </g>
          )}

          <Chip
            x={24}
            y={26}
            anchor="start"
            text={t("1 · La regla se cumple al cierre", "1 · The rule is met at the close")}
            color="var(--primary)"
            alpha={ring}
          />
          <Chip
            x={W - 24}
            y={26}
            anchor="end"
            text={t("2 · Compra en la apertura siguiente", "2 · Buy at the next open")}
            color="var(--up)"
            alpha={order}
          />
        </g>
      </svg>
    </ArtFrame>
  )
}

export { ExecutionArt }
