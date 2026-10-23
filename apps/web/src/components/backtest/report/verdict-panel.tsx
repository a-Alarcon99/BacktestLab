"use client"

import type { CSSProperties } from "react"
import { AlertTriangleIcon, HistoryIcon } from "lucide-react"
import { cn } from "cn"
import type { PreviousRun, Tone, Verdict, VerdictHeadline, VerdictItem, Warning } from "@/lib/backtest-report"
import type { BacktestResult } from "@/lib/backtests"
import { formatDate } from "@/lib/format"
import { sign, useReplayText, type ReplayFormats } from "../replay/format"
import { Reveal, toneBg, toneSoft, toneText } from "./parts"

const delay = (s: number) => ({ "--bt-delay": `${s}s` }) as CSSProperties

/** Circular seal drawn around the verdict's icon: ✓ good, ! mixed, ✕ bad. */
function Seal({ tone, className }: { tone: Tone; className?: string }) {
  const stroke = tone === "good" ? "var(--up)" : tone === "bad" ? "var(--down)" : "var(--chart-3)"
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className ?? "size-16 sm:size-20")} aria-hidden>
      <circle cx={32} cy={32} r={28} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle
        className="bt-draw"
        cx={32}
        cy={32}
        r={28}
        fill="none"
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        transform="rotate(-90 32 32)"
      />
      <circle className="bt-pop" style={{ ...delay(0.7), transformOrigin: "center" }} cx={32} cy={32} r={19} fill={stroke} fillOpacity={0.14} />
      <g className="bt-pop" style={{ ...delay(0.85), transformOrigin: "center" }} stroke={stroke} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {tone === "good" && <path d="M23 33l6 6 12-13" />}
        {tone === "mixed" && (
          <>
            <path d="M32 22v12" />
            <path d="M32 41.5v0.5" />
          </>
        )}
        {tone === "bad" && <path d="M24.5 24.5l15 15M39.5 24.5l-15 15" />}
      </g>
    </svg>
  )
}

function headlineText(headline: VerdictHeadline, t: <T>(es: T, en: T) => T) {
  switch (headline) {
    case "beats":
      return [
        t("Buena estrategia en este periodo", "A good strategy in this period"),
        t(
          "Ganó dinero y superó a comprar y mantener sin asumir un riesgo excesivo.",
          "It made money and beat buying and holding without taking excessive risk."
        ),
      ]
    case "beats-risky":
      return [
        t("Ganó más que el mercado, pero con mucho riesgo", "It beat the market, but with a lot of risk"),
        t(
          "El resultado es bueno, aunque por el camino llegó a perder bastante. ¿Aguantarías esa caída con dinero real?",
          "The result is good, but along the way it lost quite a lot. Would you sit through that fall with real money?"
        ),
      ]
    case "matches":
      return [
        t("Ganó, más o menos lo mismo que comprar y mantener", "It made about as much as buying and holding"),
        t(
          "Operar no aportó una ventaja clara frente a comprar al principio y esperar.",
          "Trading didn't add a clear edge over buying at the start and waiting."
        ),
      ]
    case "lags":
      return [
        t("Ganó dinero, pero menos que comprar y mantener", "It made money, but less than buying and holding"),
        t(
          "Habrías ganado más comprando al principio y sin hacer nada más.",
          "You would have made more by buying at the start and doing nothing else."
        ),
      ]
    case "loses-less":
      return [
        t("Perdió dinero, aunque menos que el mercado", "It lost money, but less than the market"),
        t(
          "En un periodo de caídas protegió parte del capital, pero el resultado sigue siendo negativo.",
          "In a falling period it protected part of the capital, but the result is still negative."
        ),
      ]
    case "loses":
      return [
        t("No funcionó en este periodo", "It didn't work in this period"),
        t(
          "Perdió dinero y no mejoró a comprar y mantener. Revisa sus reglas antes de usarla.",
          "It lost money and didn't beat buying and holding. Review its rules before using it."
        ),
      ]
    case "no-trades":
      return [
        t("La estrategia no llegó a operar", "The strategy never traded"),
        t(
          "Ninguna regla de compra se cumplió en este periodo, así que el capital se quedó intacto en USDT.",
          "No buy rule was met in this period, so the capital stayed untouched in USDT."
        ),
      ]
  }
}

function itemText(item: VerdictItem, f: ReplayFormats, t: <T>(es: T, en: T) => T): { title: string; text: string; badge: string } {
  switch (item.id) {
    case "result":
      return {
        title: t("Resultado", "Result"),
        badge: f.signedPct(item.returnPct, 2),
        text:
          item.tone === "good"
            ? t(`Terminó ganando ${f.usdt(item.netProfit)} sobre el capital inicial, ya con comisiones.`, `It ended up ${f.usdt(item.netProfit)} on the initial capital, fees included.`)
            : item.tone === "bad"
              ? t(`Terminó perdiendo ${f.usdt(-item.netProfit)} del capital inicial, con comisiones.`, `It ended up losing ${f.usdt(-item.netProfit)} of the initial capital, fees included.`)
              : t("Terminó prácticamente con el mismo dinero con el que empezó.", "It ended with practically the same money it started with."),
      }
    case "benchmark":
      return {
        title: t("Frente a comprar y mantener", "Versus buy and hold"),
        badge: f.pts(item.excessPts),
        text:
          item.tone === "good"
            ? t(
                `Superó por ${f.decimal1.format(item.excessPts)} puntos a comprar al inicio y no tocar nada (que hizo ${f.signedPct(item.benchmarkReturnPct)}).`,
                `It beat buying at the start and holding by ${f.decimal1.format(item.excessPts)} points (that made ${f.signedPct(item.benchmarkReturnPct)}).`
              )
            : item.tone === "bad"
              ? t(
                  `Quedó ${f.decimal1.format(-item.excessPts)} puntos por debajo de comprar al inicio y no tocar nada (que hizo ${f.signedPct(item.benchmarkReturnPct)}).`,
                  `It trailed buying at the start and holding by ${f.decimal1.format(-item.excessPts)} points (that made ${f.signedPct(item.benchmarkReturnPct)}).`
                )
              : t(
                  `Quedó a la par que comprar al inicio y no tocar nada (${f.signedPct(item.benchmarkReturnPct)}).`,
                  `It was on a par with buying at the start and holding (${f.signedPct(item.benchmarkReturnPct)}).`
                ),
      }
    case "risk":
      return {
        title: t("Riesgo", "Risk"),
        badge: item.tone === "good" ? t("Bajo", "Low") : item.tone === "bad" ? t("Alto", "High") : t("Moderado", "Moderate"),
        text: t(
          `En su peor momento llegó a estar un ${f.pct(item.drawdownPct)} por debajo de su máximo. Comprando y manteniendo, la peor caída fue del ${f.pct(item.benchmarkDrawdownPct)}.`,
          `At its worst it was ${f.pct(item.drawdownPct)} below its peak. Buying and holding, the worst fall was ${f.pct(item.benchmarkDrawdownPct)}.`
        ),
      }
    case "consistency":
      if (item.closed === 0)
        return {
          title: t("Constancia", "Consistency"),
          badge: "—",
          text: t(
            "Ninguna operación llegó a cerrarse, así que todavía no se puede medir.",
            "No trade was closed yet, so it can't be measured."
          ),
        }
      return {
        title: t("Constancia", "Consistency"),
        badge: item.profitFactor === null ? t("Sin pérdidas", "No losses") : `×${f.ratio.format(item.profitFactor)}`,
        text:
          (item.profitFactor === null
            ? t(
                item.closed === 1 ? "Ganó la única operación que cerró." : `Ganó las ${f.count.format(item.closed)} operaciones que cerró.`,
                item.closed === 1 ? "It won the only trade it closed." : `It won all ${f.count.format(item.closed)} trades it closed.`
              )
            : t(
                `Por cada 1 USDT perdido en operaciones malas ganó ${f.ratio.format(item.profitFactor)} USDT en las buenas.`,
                `For every 1 USDT lost on bad trades it made ${f.ratio.format(item.profitFactor)} USDT on the good ones.`
              )) +
          " " +
          t(
            `Acertó el ${f.pct(item.winRatePct, 0)} de ${f.plural(item.closed, "operación", "operaciones")}.`,
            `It got ${f.pct(item.winRatePct, 0)} of ${f.plural(item.closed, "trade", "trades")} right.`
          ),
      }
  }
}

function warningText(w: Warning, f: ReplayFormats, t: <T>(es: T, en: T) => T) {
  switch (w.id) {
    case "no-trades":
      return t(
        "Ninguna regla se cumplió. Prueba un periodo más largo o condiciones menos estrictas.",
        "No rule was met. Try a longer period or less strict conditions."
      )
    case "few-trades":
      return t(
        `Solo ${f.plural(w.closed, "operación cerrada", "operaciones cerradas")}: con tan pocas, el resultado puede deberse a la suerte. Lo ideal son 30 o más.`,
        `Only ${f.plural(w.closed, "closed trade", "closed trades")}: with so few, the result may be luck. 30 or more is better.`
      )
    case "open-position":
      return t(
        `Al terminar quedaba una operación abierta (${f.signedPct(w.pnlPct)}). Se ha valorado como si se vendiera al último precio, con su comisión.`,
        `A trade was still open at the end (${f.signedPct(w.pnlPct)}). It's valued as if sold at the last price, fee included.`
      )
    case "short-period":
      return t(
        `El periodo es corto (${f.count.format(Math.round(w.days))} días). Pruébala también en varios años y tipos de mercado.`,
        `The period is short (${f.count.format(Math.round(w.days))} days). Also test it over several years and market types.`
      )
    case "one-trade":
      return t(
        `Una sola operación aporta el ${f.pct(w.sharePct, 0)} de las ganancias: el resultado depende mucho de ella.`,
        `A single trade makes ${f.pct(w.sharePct, 0)} of the gains: the result depends a lot on it.`
      )
    case "sideways":
      return t(
        `El mercado apenas se movió (${f.signedPct(w.benchmarkReturnPct)}). Compárala también en un periodo de subidas y otro de caídas.`,
        `The market barely moved (${f.signedPct(w.benchmarkReturnPct)}). Also compare it in a rising and a falling period.`
      )
  }
}

/** The four verdict points, each with its tone, figure and a plain sentence. */
function VerdictItems({ verdict, className }: { verdict: Verdict; className?: string }) {
  const { t, f } = useReplayText()
  return (
    <ul className={cn("grid gap-2", className)}>
      {verdict.items.map((item, k) => {
        const text = itemText(item, f, t)
        return (
          <li key={item.id} className={cn("bt-rise flex gap-3 rounded-lg p-3", toneSoft(item.tone))} style={delay(0.6 + k * 0.12)}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", toneBg(item.tone))} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 font-semibold">
                {text.title}
                <span className={cn("num font-bold", toneText(item.tone))}>{text.badge}</span>
              </p>
              <p className="text-caption text-muted-foreground">{text.text}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Reliability warnings and the comparison with the previous run. */
export function VerdictNotes({
  warnings,
  previous,
  result,
  only,
}: {
  warnings: Warning[]
  previous: PreviousRun | null
  result: BacktestResult
  /** Just one of the two (the side verdict keeps the warnings, the strip under the charts the comparison). */
  only?: "warnings" | "previous"
}) {
  const { locale, t, f } = useReplayText()
  return (
    <>
      {warnings.length > 0 && only !== "previous" && (
        <div className="bt-rise flex flex-col gap-1.5 rounded-lg border border-chart-3/40 bg-chart-3/10 p-3" style={delay(1.1)}>
          <p className="flex items-center gap-1.5 text-caption font-bold">
            <AlertTriangleIcon className="size-3.5 text-chart-3" />
            {t("Tómalo con cuidado", "Take it with care")}
          </p>
          <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
            {warnings.map((w) => (
              <li key={w.id}>{warningText(w, f, t)}</li>
            ))}
          </ul>
        </div>
      )}

      {previous && only !== "warnings" && (
        <div className="bt-rise flex items-start gap-2.5 rounded-lg border p-3 text-caption" style={delay(1.2)}>
          <HistoryIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p>
              <span className="font-semibold">{t("Frente a tu ejecución anterior", "Versus your previous run")}</span>{" "}
              <span className="text-muted-foreground">
                ({formatDate(previous.record.executedAt, locale)} · {previous.record.timeframe} · {formatDate(previous.record.from, locale)} →{" "}
                {formatDate(previous.record.to, locale)})
              </span>
            </p>
            <p className="num">
              {t("Resultado", "Result")}{" "}
              <b className={cn(sign(previous.returnDelta) === "up" && "text-up", sign(previous.returnDelta) === "down" && "text-down")}>
                {f.pts(previous.returnDelta)}
              </b>{" "}
              ({f.signedPct(previous.record.stats.returnPct)} → {f.signedPct(result.stats.returnPct)}) · {t("Caída máx.", "Max drawdown")}{" "}
              <b className={cn(sign(-previous.drawdownDelta) === "up" && "text-up", sign(-previous.drawdownDelta) === "down" && "text-down")}>
                {f.signedPct(-previous.record.stats.maxDrawdownPct)} → {f.signedPct(-result.stats.maxDrawdownPct)}
              </b>{" "}
              · {t("Acierto", "Win rate")}{" "}
              <b>
                {f.pct(previous.record.stats.winRatePct, 0)} → {f.pct(result.stats.winRatePct, 0)}
              </b>
            </p>
            {(!previous.samePeriod || !previous.sameRules) && (
              <p className="text-muted-foreground">
                {!previous.samePeriod && !previous.sameRules
                  ? t("Cambiaron el periodo y las reglas: compara con cautela.", "Both the period and the rules changed: compare with care.")
                  : !previous.samePeriod
                    ? t("Era otro periodo o temporalidad: el mercado no fue el mismo.", "It was another period or timeframe: the market wasn't the same.")
                    : t("Mismo periodo, con reglas distintas: la diferencia viene de tus cambios.", "Same period, different rules: the difference comes from your changes.")}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * The verdict. On top of the report (`side` false) it is a card with the seal, the four points
 * and the notes. `side` is the wide-screen version that lives in the column next to the charts:
 * stacked, with the warnings but not the comparison with the previous run, which goes in a
 * strip under the charts (`VerdictNotes only="previous"`).
 */
export function VerdictPanel({
  verdict,
  warnings,
  previous,
  result,
  side = false,
}: {
  verdict: Verdict
  warnings: Warning[]
  previous: PreviousRun | null
  result: BacktestResult
  side?: boolean
}) {
  const { t } = useReplayText()
  const [title, lead] = headlineText(verdict.headline, t)
  const head = (
    <div className={cn("flex gap-4", side ? "flex-col items-start gap-3" : "items-center")}>
      <Seal tone={verdict.tone} className={side ? "size-14" : undefined} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className={cn("bt-fade text-[11px] font-semibold tracking-wide uppercase", toneText(verdict.tone))} style={delay(0.2)}>
          {t("Veredicto", "Verdict")}
        </p>
        <h3 className={cn("bt-rise leading-tight font-bold tracking-tight text-balance", side ? "text-title" : "text-heading")} style={delay(0.3)}>
          {title}
        </h3>
        <p className={cn("bt-rise text-muted-foreground", side && "text-caption")} style={delay(0.45)}>
          {lead}
        </p>
      </div>
    </div>
  )
  if (side) {
    return (
      <Reveal label={t("Veredicto", "Verdict")} className="flex flex-col gap-4">
        {head}
        <VerdictItems verdict={verdict} />
        <VerdictNotes only="warnings" warnings={warnings} previous={previous} result={result} />
      </Reveal>
    )
  }
  return (
    <Reveal label={t("Veredicto", "Verdict")} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      {head}
      <VerdictItems verdict={verdict} className="sm:grid-cols-2" />
      <VerdictNotes warnings={warnings} previous={previous} result={result} />
    </Reveal>
  )
}
