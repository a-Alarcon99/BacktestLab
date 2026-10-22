"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePageVisible } from "@/lib/motion"
import { replayDuration } from "@/lib/replay"

export const SPEEDS = [1, 2, 4] as const
export type Speed = (typeof SPEEDS)[number]

/**
 * Playback position of the replay, in display candles (a float: `pos` = candles revealed).
 * Advances with requestAnimationFrame while playing in a visible tab, so pausing, changing the
 * speed or seeking never desyncs anything: every frame is a pure function of `pos`.
 * With reduced motion it starts finished.
 */
export function usePlayback(steps: number, reduced: boolean) {
  /** Candles per second at 1×. */
  const cps = steps / (replayDuration(steps) / 1000)
  const [pos, setPos] = useState(reduced ? steps : 0)
  const [playing, setPlaying] = useState(!reduced)
  const [speed, setSpeed] = useState<Speed>(1)
  const [finished, setFinished] = useState(reduced)
  const visible = usePageVisible()
  const posRef = useRef(pos)
  const speedRef = useRef(speed)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    if (!playing || !visible) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      // A long gap (tab switch, debugger) shouldn't jump ahead.
      const dt = Math.min(now - last, 100) / 1000
      last = now
      const next = Math.min(steps, posRef.current + dt * cps * speedRef.current)
      posRef.current = next
      setPos(next)
      if (next >= steps) {
        setPlaying(false)
        setFinished(true)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, visible, steps, cps])

  const seek = useCallback(
    (value: number) => {
      const next = Math.min(steps, Math.max(0, value))
      posRef.current = next
      setPos(next)
      if (next >= steps) {
        setPlaying(false)
        setFinished(true)
      }
    },
    [steps]
  )

  const restart = useCallback(() => {
    posRef.current = 0
    setPos(0)
    setFinished(false)
    setPlaying(true)
  }, [])

  const toggle = useCallback(() => {
    if (posRef.current >= steps) restart()
    else setPlaying((p) => !p)
  }, [steps, restart])

  return {
    pos,
    playing,
    speed,
    finished,
    cps,
    setSpeed,
    seek,
    restart,
    toggle,
    pause: useCallback(() => setPlaying(false), []),
    skip: useCallback(() => seek(steps), [seek, steps]),
  }
}

export type Playback = ReturnType<typeof usePlayback>

/**
 * Seconds since `active` turned true, ticking until `until` (then it stays there). Infinity
 * with reduced motion, so anything timed off it shows its final frame.
 */
export function useSince(active: boolean, until: number, reduced: boolean) {
  const [time, setTime] = useState(0)
  useEffect(() => {
    if (!active || reduced) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      setTime(Math.min(t, until))
      if (t < until) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      setTime(0)
    }
  }, [active, until, reduced])
  if (reduced) return active ? Infinity : 0
  return active ? time : 0
}
