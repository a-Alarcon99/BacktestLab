"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react"

// Shared plumbing of the animations (landing, backtest replay): they only run while visible on screen, in a visible
// tab, and show their final frame when the visitor asks for reduced motion.

const reducedQuery = "(prefers-reduced-motion: reduce)"

function subscribeReduced(onChange: () => void) {
  const media = window.matchMedia(reducedQuery)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/** True when the visitor prefers reduced motion (false on the server render). */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false
  )
}

/** True while the viewport matches a media query (false on the server render). */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}

/** False while the tab is hidden. */
export function usePageVisible() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true
  )
}

/** Whether the element is (at least partly) on screen. With `once`, stays true after the first time. */
export function useInView(ref: RefObject<Element | null>, { once = false, rootMargin = "0px" } = {}) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
        if (once && entry.isIntersecting) observer.disconnect()
      },
      { rootMargin }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, once, rootMargin])
  return inView
}

/** On screen, in a visible tab and motion allowed: the animation should play. */
export function useShouldPlay(ref: RefObject<Element | null>) {
  const inView = useInView(ref)
  const visible = usePageVisible()
  const reduced = useReducedMotion()
  return { play: inView && visible && !reduced, reduced }
}

/**
 * Seconds the animation has been playing: advances with requestAnimationFrame only while
 * `running`, so it resumes where it paused. `reset()` starts it again from 0.
 */
export function useClock(running: boolean) {
  const [time, setTime] = useState(0)
  const elapsed = useRef(0)
  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      // A long gap (tab switch, debugger) shouldn't make the animation jump ahead.
      elapsed.current += Math.min(now - last, 100) / 1000
      last = now
      setTime(elapsed.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running])
  const reset = () => {
    elapsed.current = 0
    setTime(0)
  }
  return { time, reset }
}

/** Width of an element, kept up to date with a ResizeObserver (0 before the first measure). */
export function useWidth(ref: RefObject<Element | null>) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** Height of an element, kept up to date with a ResizeObserver (0 before the first measure). */
export function useHeight(ref: RefObject<Element | null>) {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return height
}

/**
 * A loop counter for CSS-driven animations: bumps `cycle` every `seconds` while `running`, to be
 * used as a React `key` so the animated subtree restarts. Pauses (keeping its place) otherwise.
 */
export function useCssLoop(seconds: number, running: boolean) {
  const [cycle, setCycle] = useState(0)
  const elapsed = useRef(0)
  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      elapsed.current += Math.min(now - last, 100) / 1000
      last = now
      if (elapsed.current >= seconds) {
        elapsed.current = 0
        setCycle((c) => c + 1)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, seconds])
  const restart = () => {
    elapsed.current = 0
    setCycle((c) => c + 1)
  }
  return { cycle, restart }
}
