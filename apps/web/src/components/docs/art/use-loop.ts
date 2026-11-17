"use client"

import type { RefObject } from "react"
import { useClock, useShouldPlay } from "@/lib/motion"

/**
 * Time (seconds) of a looping figure: advances only while it is on screen, in a visible tab and
 * with motion allowed. Before it first plays (server render, reduced motion) it sits on `rest`,
 * a frame where everything is already drawn.
 */
export function useLoop(ref: RefObject<Element | null>, cycle: number, rest: number) {
  const { play } = useShouldPlay(ref)
  const { time } = useClock(play)
  return time === 0 ? rest : time % cycle
}
