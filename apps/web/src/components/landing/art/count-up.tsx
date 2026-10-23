"use client"

import { useEffect, useRef, useState } from "react"
import { useI18n } from "@/components/i18n/locale-provider"
import { easeOutCubic } from "@/lib/chart-geometry"
import { num } from "../format"
import { useInView, useReducedMotion } from "@/lib/motion"

/**
 * M1 · A figure that counts up from 0 when it scrolls into view. The server renders the final
 * value (no-JS, SEO); figures already on screen when the page loads don't count, to avoid a flash.
 */
function CountUp({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const { locale } = useI18n()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const state = useRef<"idle" | "armed" | "done">("idle")

  useEffect(() => {
    const element = ref.current
    if (reduced || !element || state.current !== "idle") return
    const box = element.getBoundingClientRect()
    const visible = box.top < window.innerHeight && box.bottom > 0
    state.current = visible ? "done" : "armed"
    if (!visible) setShown(0)
  }, [reduced])

  useEffect(() => {
    if (!inView || state.current !== "armed") return
    state.current = "done"
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const u = Math.min((now - start) / 1000 / duration, 1)
      setShown(Math.round(value * easeOutCubic(u)))
      if (u < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, value, duration])

  return (
    <span ref={ref} className="num">
      {num(locale, shown)}
    </span>
  )
}

export { CountUp }
