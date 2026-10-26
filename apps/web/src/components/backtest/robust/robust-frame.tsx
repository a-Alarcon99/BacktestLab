"use client"

import { useCallback, useEffect, useRef, type CSSProperties } from "react"
import { CheckCircle2Icon, DownloadIcon, LoaderCircleIcon, PauseIcon, RotateCcwIcon } from "lucide-react"
import { cn } from "cn"
import { useI18n } from "@/components/i18n/locale-provider"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { RobustRequest } from "@/lib/backtests"
import type { Timeframe } from "@/lib/candles"
import { easeOutCubic, phase } from "@/lib/chart-geometry"
import { formatDate } from "@/lib/format"
import { useReducedMotion } from "@/lib/motion"
import type { Criterion, RobustReport } from "@/lib/robustness-report"
import { ExpandButton } from "../backtest-replay"
import { useReplayText } from "../replay/format"
import { TimelineBar } from "../replay/live-panels"
import { SPEEDS, usePlayback, useSince, type Playback, type Speed } from "../replay/use-playback"
import { STEPS } from "../multi/multi-data"
import { Reveal } from "../report/parts"
import { toneBg, toneSoft, toneText } from "../report/parts"
import { Seal } from "../report/verdict-panel"
import { Hint } from "./hover"
import { testMeta, type MetaKind } from "./test-meta"

export type RobustRun = RobustRequest & {
  /** "new": just executed (saved to the history); "review": re-run from the history (free). */
  mode: "new" | "review"
}

/** What the header and the frame need to know about a run (a robustness test or a Monte Carlo). */
export type FrameRun = {
  kind: MetaKind
  symbol: string
  timeframe: Timeframe
  from: string
  to: string
  strategy: { name: string }
  mode: "new" | "review"
  /** Text for the header when the run's own fields don't say it (Monte Carlo). */
  options?: string
  lengthDays?: number
  stepDays?: number
  params?: string[]
}

/** Seconds of the transition from the animation to the results. */
const SETTLE = 1.6

const delay = (s: number) => ({ "--bt-delay": `${s}s` }) as CSSProperties

/** What a test adds to the usual "timeframe · range" line of the header. */
function optionsText(run: FrameRun, t: <V>(es: V, en: V) => V): string {
  if (run.options) return run.options
  if (run.kind === "windows" && run.lengthDays !== undefined) return t(`ventanas de ${run.lengthDays} d cada ${run.stepDays} d`, `${run.lengthDays} d windows every ${run.stepDays} d`)
  if (run.kind === "sensitivity" && run.params) return t(`${run.params.length} parámetro${run.params.length === 1 ? "" : "s"} variado${run.params.length === 1 ? "" : "s"}`, `${run.params.length} parameter${run.params.length === 1 ? "" : "s"} varied`)
  return t("temporalidades vecinas", "neighbouring timeframes")
}

export function RobustHeader({
  run,
  expanded,
  onExpandedChange,
  children,
}: {
  run: FrameRun
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  children?: React.ReactNode
}) {
  const { locale, t } = useI18n()
  const meta = testMeta(run.kind, t)
  return (
    <header className="flex items-start gap-3 border-b px-4 py-3 md:px-5">
      <span className="relative shrink-0" aria-hidden>
        <AssetAvatar symbol={run.symbol} size={40} />
        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card [&_svg]:size-3">{meta.icon}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <DialogTitle className="truncate text-title font-bold">
          {meta.title} · {run.symbol.toUpperCase()}/USDT · {run.strategy.name}
        </DialogTitle>
        <DialogDescription className="num text-caption text-muted-foreground">
          {run.timeframe} · {formatDate(run.from, locale)} → {formatDate(run.to, locale)} · {optionsText(run, t)} ·{" "}
          {run.mode === "new" ? t("Ejecutado ahora", "Run just now") : t("Revisión de backtest", "Backtest review")}
        </DialogDescription>
      </div>
      {children}
      <ExpandButton expanded={expanded} onChange={onExpandedChange} />
      <DialogClose data-print-hide />
    </header>
  )
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=menu]") !== null)

/**
 * Layout shared by the three robustness tests: a header, the animation on one clock (`animation`
 * draws a pure function of the position), the results that rise in when it ends, and a footer with
 * the timeline. Keyboard: space, ←/→, 1/2/4, End/S, R (same as the other replays).
 */
export function RobustFrame({
  run,
  expanded,
  onExpandedChange,
  onClose,
  animation,
  results,
  dateAt,
  counterAt,
  onCsv,
  extraActions,
  label,
}: {
  run: FrameRun
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onClose: () => void
  /** The animated part, drawn at the playback position. */
  animation: (pos: number, finished: boolean) => React.ReactNode
  results: React.ReactNode
  /** Text for the date label and the counter of the timeline bar at a position. */
  dateAt: (pos: number) => string
  counterAt: (pos: number) => string
  onCsv?: () => void
  /** More buttons for the footer once the animation has finished. */
  extraActions?: React.ReactNode
  label: string
}) {
  const { t } = useReplayText()
  const reduced = useReducedMotion()
  const playback = usePlayback(STEPS, reduced)
  const { finished } = playback
  const since = useSince(finished, SETTLE, reduced)
  const scrollRef = useRef<HTMLDivElement>(null)

  const restart = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    playback.restart()
  }, [playback])

  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const onControl = e.target instanceof HTMLElement && e.target.closest("button, [role=slider], summary, a, tr[tabindex], [role=button]")
      if (finished) {
        if (e.key === "r" || e.key === "R") restart()
        else return
        e.preventDefault()
        return
      }
      if (e.key === " " && !onControl) playback.toggle()
      else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !onControl) playback.seek(playback.pos + (e.key === "ArrowRight" ? 1 : -1) * STEPS * 0.02)
      else if (SPEEDS.includes(Number(e.key) as Speed)) playback.setSpeed(Number(e.key) as Speed)
      else if (e.key === "End" || e.key === "s" || e.key === "S") playback.skip()
      else if (e.key === "r" || e.key === "R") restart()
      else return
      e.preventDefault()
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  const status = finished
    ? { variant: "up" as const, icon: <CheckCircle2Icon />, text: t("Completado", "Done") }
    : playback.playing
      ? { variant: "primary" as const, icon: <LoaderCircleIcon className="animate-spin" />, text: t("Reproduciendo", "Replaying") }
      : { variant: "default" as const, icon: <PauseIcon />, text: t("En pausa", "Paused") }
  // The results rise in once the animation has finished (final frame at once with reduced motion).
  const rise = easeOutCubic(phase(since, 0.15, 1))

  return (
    <>
      <RobustHeader run={run} expanded={expanded} onExpandedChange={onExpandedChange}>
        <Badge variant={status.variant} className="hidden sm:inline-flex">
          {status.icon}
          {status.text}
        </Badge>
      </RobustHeader>

      <div ref={scrollRef} data-report-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 bg-card p-3 sm:p-4 md:p-5">
          <section aria-label={label} className="rounded-xl border bg-card shadow-xl shadow-primary/5 ring-1 ring-foreground/[0.03]">
            {animation(playback.pos, finished)}
            <p className="sr-only" aria-live="polite">
              {finished ? t("Reproducción completada", "Replay finished") : ""}
            </p>
          </section>
          {finished && (
            <div className="flex flex-col gap-4" style={{ opacity: rise, transform: `translateY(${(1 - rise) * 12}px)` }}>
              {results}
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t px-3 py-3 sm:px-4 md:px-5">
        {finished ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={restart}>
              <RotateCcwIcon data-icon="inline-start" />
              {t("Repetir animación", "Replay animation")}
            </Button>
            {extraActions}
            {onCsv && (
              <Button variant="outline" onClick={onCsv}>
                <DownloadIcon data-icon="inline-start" />
                CSV
              </Button>
            )}
            <Button onClick={onClose}>{t("Cerrar", "Close")}</Button>
          </div>
        ) : (
          <TimelineBar playback={playback as Playback} steps={STEPS} date={dateAt(playback.pos)} counter={counterAt(playback.pos)} />
        )}
      </footer>
    </>
  )
}

// --- Verdict ---------------------------------------------------------------------------------

type T = <V>(es: V, en: V) => V

function headlineText(report: RobustReport, t: T): [string, string] {
  const h = report.headline
  if (h === "none")
    return [
      t("No se pudo ejecutar la prueba", "The test couldn't run"),
      t("Ninguna simulación tuvo velas suficientes en este rango. Prueba con otras fechas u otra temporalidad.", "No simulation had enough candles in this range. Try other dates or another timeframe."),
    ]
  if (report.test === "windows") {
    if (h === "consistent") return [t("Funciona en casi cualquier periodo", "It works in almost any period"), t("Ganó dinero en la mayoría de las ventanas, no solo en un tramo afortunado.", "It made money in most windows, not just in one lucky stretch.")]
    if (h === "uneven") return [t("Resultados desiguales según el periodo", "Uneven results depending on the period"), t("Gana en unos tramos y pierde en otros: su ventaja depende de cuándo empieces.", "It wins in some stretches and loses in others: its edge depends on when you start.")]
    if (h === "fragile") return [t("Frágil: depende del periodo", "Fragile: it depends on the period"), t("Solo gana en unas pocas ventanas. Lo que viste en el rango completo pudo ser casualidad.", "It only wins in a few windows. What you saw over the whole range may have been luck.")]
    return [t("Pierde en casi todos los periodos", "It loses in almost every period"), t("Revisa las reglas antes de seguir.", "Review the rules before going on.")]
  }
  if (report.test === "sensitivity") {
    if (h === "plateau") return [t("Meseta: los parámetros vecinos rinden parecido", "Plateau: neighbouring parameters do about as well"), t("Pequeños cambios no la rompen, una buena señal de robustez.", "Small changes don't break it, a good sign of robustness.")]
    if (h === "peak") return [t("Pico aislado: posible sobreajuste", "Isolated peak: possible overfitting"), t("Funciona con estos valores exactos, pero sus vecinos rinden mucho peor. Probablemente esté ajustada al pasado.", "It works with these exact values, but its neighbours do much worse. It is probably fitted to the past.")]
    if (h === "mixed") return [t("Sensibilidad moderada", "Moderate sensitivity"), t("Aguanta algunos cambios pero no todos. Prueba con otros parámetros o rangos.", "It stands some changes but not all. Try other parameters or ranges.")]
    return [t("Débil con casi cualquier valor", "Weak with almost any value"), t("La mayoría de las variantes pierde dinero: los parámetros no son el problema.", "Most variants lose money: the parameters aren't the issue.")]
  }
  if (h === "consistent") return [t("Se sostiene en temporalidades vecinas", "It holds on neighbouring timeframes"), t("Gana también en las temporalidades de al lado: no depende de una sola.", "It also wins on the neighbouring timeframes: it doesn't depend on a single one.")]
  if (h === "lonely") return [t("Solo funciona en esta temporalidad", "It only works on this timeframe"), t("Las vecinas pierden: el resultado puede ser casualidad de esta temporalidad.", "The neighbours lose: the result may be a fluke of this timeframe.")]
  if (h === "mixed") return [t("Resultados desiguales entre temporalidades", "Uneven results across timeframes"), t("Funciona en algunas y falla en otras.", "It works on some and fails on others.")]
  return [t("No se sostiene al cambiar de temporalidad", "It doesn't hold when the timeframe changes"), t("Pierde en la mayoría de las temporalidades probadas.", "It loses on most of the timeframes tested.")]
}

function criterionText(c: Criterion, test: RobustReport["test"], t: T): { label: string; hint: string; more: string } {
  switch (`${test}:${c.id}`) {
    case "windows:positive":
      return {
        label: t("Ventanas rentables", "Profitable windows"),
        hint: t("Bien a partir del 70 %", "Good from 70 %"),
        more: t("Porcentaje de periodos en los que la estrategia terminó con beneficio. Una estrategia con ventaja real debería ganar en la mayoría de los tramos, no solo en el rango completo.", "Share of the periods in which the strategy ended with a profit. A strategy with a real edge should win in most stretches, not only over the whole range."),
      }
    case "windows:beats":
      return {
        label: t("Ventanas que superan a mantener", "Windows beating buy and hold"),
        hint: t("Bien a partir del 50 %", "Good from 50 %"),
        more: t("Porcentaje de periodos en los que la estrategia ganó más que comprar al inicio y no hacer nada. Si casi nunca lo supera, operar no aporta valor frente a mantener.", "Share of the periods in which the strategy made more than buying at the start and doing nothing. If it almost never beats it, trading adds no value over holding."),
      }
    case "windows:worst":
      return {
        label: t("Peor ventana", "Worst window"),
        hint: t("Bien si no pierde más del 15 %", "Good if it loses no more than 15 %"),
        more: t("Resultado del periodo más desfavorable. Indica cuánto podría perder quien hubiera empezado a usar la estrategia en el peor momento.", "Result of the least favourable period. It shows how much someone who started using the strategy at the worst moment could have lost."),
      }
    case "windows:drawdown":
      return {
        label: t("Mayor caída dentro de una ventana", "Deepest drop inside a window"),
        hint: t("Bien por debajo del 25 %", "Good below 25 %"),
        more: t("La mayor bajada del capital desde un máximo dentro de cualquier periodo. Mide el peor momento que habría que soportar sin abandonar la estrategia.", "The largest fall of the capital from a peak inside any period. It measures the worst moment you would have to endure without abandoning the strategy."),
      }
    case "sensitivity:profitable":
      return {
        label: t("Variantes rentables", "Profitable variants"),
        hint: t("Bien a partir del 70 %", "Good from 70 %"),
        more: t("Porcentaje de combinaciones de parámetros que ganan dinero. Si casi todas ganan, el resultado no depende de haber elegido unos valores concretos.", "Share of the parameter combinations that make money. If nearly all of them win, the result doesn't depend on having picked some exact values."),
      }
    case "sensitivity:plateau":
      return {
        label: t("Vecinas frente a la original", "Neighbours vs the original"),
        hint: t("Bien si las vecinas conservan el 70 % de su rentabilidad", "Good if neighbours keep 70 % of its return"),
        more: t("Rentabilidad media de las variantes más próximas a la tuya, como porcentaje de la tuya. Un valor alto indica una meseta estable; uno bajo, que tus valores son un pico aislado, típico del sobreajuste.", "Average return of the variants closest to yours, as a share of yours. A high value means a stable plateau; a low one means your values are an isolated peak, typical of overfitting."),
      }
    case "sensitivity:worst":
      return {
        label: t("Peor variante", "Worst variant"),
        hint: t("Bien si no pierde dinero", "Good if it doesn't lose money"),
        more: t("Resultado de la combinación menos favorable. Muestra lo que ocurriría si los parámetros óptimos cambiaran ligeramente en el futuro.", "Result of the least favourable combination. It shows what would happen if the best parameters shifted slightly in the future."),
      }
    case "timeframes:profitable":
      return {
        label: t("Temporalidades rentables", "Profitable timeframes"),
        hint: t("Bien a partir del 80 %", "Good from 80 %"),
        more: t("Porcentaje de temporalidades probadas que terminan con beneficio. Una idea sólida suele funcionar también con velas algo más cortas o más largas.", "Share of the tested timeframes that end with a profit. A sound idea usually also works with somewhat shorter or longer candles."),
      }
    case "timeframes:beats":
      return {
        label: t("Superan a mantener", "Beating buy and hold"),
        hint: t("Bien a partir del 50 %", "Good from 50 %"),
        more: t("Porcentaje de temporalidades en las que la estrategia gana más que comprar y mantener durante el mismo rango.", "Share of the timeframes in which the strategy makes more than buying and holding over the same range."),
      }
    default:
      return {
        label: t("Vecinas rentables", "Profitable neighbours"),
        hint: t("Bien a partir del 60 %", "Good from 60 %"),
        more: t("Porcentaje de temporalidades contiguas a la elegida que ganan dinero. Si solo funciona la elegida, el resultado puede deberse a esa temporalidad concreta.", "Share of the timeframes next to the chosen one that make money. If only the chosen one works, the result may be due to that exact timeframe."),
      }
  }
}

function ScoreRing({ score, tone }: { score: number; tone: RobustReport["tone"] }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`${score} / 100`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--muted)" strokeWidth={6} />
        <circle
          cx={32}
          cy={32}
          r={r}
          fill="none"
          className={toneText(tone)}
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <span className={cn("num absolute inset-0 flex items-center justify-center text-title font-bold", toneText(tone))}>{score}</span>
    </div>
  )
}

/** Traffic light per criterion and the 0-100 score of a test. `format` turns a criterion's value into text. */
export function RobustVerdict({
  report,
  strategyName,
  format,
  notes = [],
}: {
  report: RobustReport
  strategyName: string
  format: (c: Criterion) => string
  notes?: string[]
}) {
  const { t } = useReplayText()
  const [title, lead] = headlineText(report, t)
  const all = report.smallSample && report.headline !== "none" ? [...notes, t("Con tan pocas simulaciones la conclusión es orientativa.", "With so few simulations the conclusion is only indicative.")] : notes
  return (
    <Reveal label={t("Veredicto de robustez", "Robustness verdict")} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <Seal tone={report.tone} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cn("bt-fade text-[11px] font-semibold tracking-wide uppercase", toneText(report.tone))} style={delay(0.2)}>
            {t("Veredicto de robustez", "Robustness verdict")} · {strategyName}
          </p>
          <h3 className="bt-rise text-heading leading-tight font-bold tracking-tight text-balance" style={delay(0.3)}>
            {title}
          </h3>
          <p className="bt-rise text-muted-foreground" style={delay(0.45)}>
            {lead}
          </p>
        </div>
        {report.headline !== "none" && <ScoreRing score={report.score} tone={report.tone} />}
      </div>

      {report.headline !== "none" && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("Semáforo por criterio", "Traffic light by criterion")}>
          {report.criteria.map((c, i) => {
            const text = criterionText(c, report.test, t)
            return (
              <li key={c.id} className={cn("bt-rise flex min-w-0 flex-col gap-0.5 rounded-lg p-3", toneSoft(c.tone))} style={delay(0.55 + i * 0.1)}>
                <span className="flex items-center gap-2 text-caption text-muted-foreground">
                  <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", toneBg(c.tone))} />
                  <span className="truncate">{text.label}</span>
                  <Hint title={text.label}>{text.more}</Hint>
                </span>
                <span className={cn("num text-title font-bold", toneText(c.tone))}>{format(c)}</span>
                <span className="text-[11px] text-muted-foreground">{text.hint}</span>
              </li>
            )
          })}
        </ul>
      )}

      {all.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3 text-caption text-muted-foreground">
          {all.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Reveal>
  )
}

export type { Playback }
