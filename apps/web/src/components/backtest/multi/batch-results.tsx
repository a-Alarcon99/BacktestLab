"use client"

import { useMemo, useRef, useState, type CSSProperties } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { cn } from "cn"
import { AssetAvatar } from "@/components/market/asset-avatar"
import { Badge } from "@/components/ui/badge"
import {
  batchRows,
  consistency,
  sortRows,
  type BatchRow,
  type BatchSummary,
  type Consistency,
  type SortKey,
} from "@/lib/batch-report"
import type { AssetsBatchResult } from "@/lib/backtests"
import { extent, linePath, linear, niceTicks, pad } from "@/lib/chart-geometry"
import { useWidth } from "@/lib/motion"
import { fanOf, resample } from "@/lib/robustness-report"
import { ChartTip, Crosshair, Hint, HoverDot, indexAtX, TipRow, TipTitle, useChartHover } from "../robust/hover"
import { glow, ReadingPanel, signVar, spreadOut, Tag, useSvgId, VizDefs } from "../robust/viz"
import { useReplayText } from "../replay/format"
import { Seal } from "../report/verdict-panel"
import type { TileData, Timeline } from "./multi-data"
import { InfoHint, Reveal, toneSoft, toneText } from "../report/parts"

const delay = (s: number) => ({ "--bt-delay": `${s}s` }) as CSSProperties

function headlineText(c: Consistency, t: <T>(es: T, en: T) => T): [string, string] {
  switch (c.headline) {
    case "consistent":
      return [
        t("Funciona de forma consistente", "It works consistently"),
        t(
          "Ganó dinero en casi todos los activos y superó a comprar y mantener en buena parte de ellos: la estrategia no depende de un solo mercado.",
          "It made money on almost every asset and beat buying and holding on many of them: the strategy doesn't depend on a single market."
        ),
      ]
    case "mostly":
      return [
        t("Funciona en la mayoría de los activos", "It works on most assets"),
        t(
          "Gana en la mayor parte, pero no en todos. Mira cuáles fallan antes de fiarte de ella.",
          "It wins on most of them, but not all. Check which ones fail before trusting it."
        ),
      ]
    case "mixed":
      return [
        t("Resultados desiguales", "Uneven results"),
        t(
          "Gana en unos activos y pierde en otros. Es difícil decir que la estrategia tenga ventaja propia.",
          "It wins on some assets and loses on others. It's hard to say the strategy has an edge of its own."
        ),
      ]
    case "fragile":
      return [
        t("Frágil: solo gana en pocos activos", "Fragile: it only wins on a few assets"),
        t(
          "Lo que funcionó en uno o dos activos probablemente fue casualidad del periodo, no una ventaja de la estrategia.",
          "What worked on one or two assets was probably luck of the period, not an edge of the strategy."
        ),
      ]
    case "loses":
      return [
        t("No funciona en estos activos", "It doesn't work on these assets"),
        t(
          "Perdió dinero en casi todos. Revisa las reglas antes de seguir.",
          "It lost money on almost all of them. Review the rules before going on."
        ),
      ]
    case "none":
      return [
        t("No se pudo ejecutar ningún activo", "No asset could be run"),
        t(
          "Ninguno tiene velas suficientes en este rango. Prueba con otras fechas o con otros activos.",
          "None of them has enough candles in this range. Try other dates or other assets."
        ),
      ]
  }
}

/** The consistency verdict: in how many assets the strategy made money and beat buy and hold. */
export function BatchVerdict({ summary, strategyName }: { summary: BatchSummary; strategyName: string }) {
  const { t, f } = useReplayText()
  const c = consistency(summary)
  const [title, lead] = headlineText(c, t)
  const notes: string[] = []
  if (c.smallSample && c.ran > 0)
    notes.push(t("Con tan pocos activos, la conclusión es orientativa: prueba con más.", "With so few assets the conclusion is only indicative: try more."))
  if (summary.failed > 0)
    notes.push(
      t(
        `${f.plural(summary.failed, "activo no tenía", "activos no tenían")} velas suficientes en el rango y no se ${summary.failed === 1 ? "contó" : "contaron"} (su cupo se devolvió).`,
        `${summary.failed} ${summary.failed === 1 ? "asset" : "assets"} didn't have enough candles in the range and ${summary.failed === 1 ? "wasn't" : "weren't"} counted (their quota was given back).`
      )
    )
  if (summary.lateStarts > 0)
    notes.push(
      t(
        `${f.plural(summary.lateStarts, "activo empezó", "activos empezaron")} más tarde por tener menos histórico: no se compara el mismo periodo que en el resto.`,
        `${summary.lateStarts} ${summary.lateStarts === 1 ? "asset started" : "assets started"} later because of a shorter history: it doesn't cover the same period as the rest.`
      )
    )
  return (
    <Reveal label={t("Veredicto de consistencia", "Consistency verdict")} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <Seal tone={c.tone} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className={cn("bt-fade text-[11px] font-semibold tracking-wide uppercase", toneText(c.tone))} style={delay(0.2)}>
            {t("Veredicto de consistencia", "Consistency verdict")} · {strategyName}
          </p>
          <h3 className="bt-rise text-heading leading-tight font-bold tracking-tight text-balance" style={delay(0.3)}>
            {title}
          </h3>
          <p className="bt-rise text-muted-foreground" style={delay(0.45)}>
            {lead}
          </p>
        </div>
      </div>

      {c.ran > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label={t("Rentable en", "Profitable on")}
            hint={t("Número de activos en los que la estrategia terminó con beneficio. Una estrategia con ventaja propia suele ganar en la mayoría de los mercados, no solo en uno.", "Number of assets on which the strategy ended with a profit. A strategy with an edge of its own usually wins on most markets, not only on one.")}
            value={`${c.profitable} / ${c.ran}`}
            tone={c.profitable / c.ran >= 0.6 ? "good" : c.profitable / c.ran >= 0.4 ? "mixed" : "bad"}
            delaySec={0.55}
          />
          <Figure
            label={t("Supera a mantener en", "Beats holding on")}
            hint={t("Activos en los que la estrategia ganó más que comprar al inicio y conservar hasta el final. En mercados alcistas es difícil de superar; si casi nunca lo consigue, operar no aporta valor.", "Assets on which the strategy made more than buying at the start and holding to the end. In rising markets it is hard to beat; if it almost never does, trading adds no value.")}
            value={`${c.beatsHold} / ${c.ran}`}
            tone={c.beatsHold / c.ran >= 0.5 ? "good" : c.beatsHold / c.ran >= 0.3 ? "mixed" : "bad"}
            delaySec={0.65}
          />
          <Figure
            label={t("Rentabilidad media", "Average return")}
            hint={t("Media de la rentabilidad de todos los activos. La mediana (debajo) es el valor central: si ambas difieren mucho, uno o dos activos están inclinando la media.", "Average return over every asset. The median (below) is the middle value: if both differ a lot, one or two assets are tilting the average.")}
            sub={`${t("mediana", "median")} ${summary.medianReturnPct === null ? "—" : f.signedPct(summary.medianReturnPct)}`}
            value={summary.meanReturnPct === null ? "—" : f.signedPct(summary.meanReturnPct)}
            tone={summary.meanReturnPct === null ? "mixed" : summary.meanReturnPct > 0 ? "good" : "bad"}
            delaySec={0.75}
          />
          <Figure
            label={t("Mejor y peor", "Best and worst")}
            hint={t("Activos con el mejor y el peor resultado. Una diferencia muy grande indica que el resultado depende mucho del mercado elegido.", "Assets with the best and the worst result. A very large gap means the result depends heavily on the chosen market.")}
            value={summary.best && summary.worst ? `${summary.best.symbol} · ${summary.worst.symbol}` : "—"}
            sub={
              summary.best && summary.worst
                ? `${f.signedPct(summary.best.returnPct)} · ${f.signedPct(summary.worst.returnPct)}`
                : undefined
            }
            tone="mixed"
            neutral
            delaySec={0.85}
          />
        </dl>
      )}

      {c.ran > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label={t("Caída máxima media", "Average max drawdown")}
            hint={t("Media, entre los activos, de la mayor caída del capital desde un máximo. Mide la pérdida temporal que habría que soportar sin abandonar la estrategia.", "Average, across the assets, of the largest fall of the capital from a peak. It measures the temporary loss you would have to endure without abandoning the strategy.")}
            value={summary.meanDrawdownPct === null ? "—" : `−${f.pct(summary.meanDrawdownPct)}`}
            sub={summary.shallowest ? t(`la menor: ${summary.shallowest.symbol} (−${f.pct(summary.shallowest.drawdownPct)})`, `the smallest: ${summary.shallowest.symbol} (−${f.pct(summary.shallowest.drawdownPct)})`) : undefined}
            tone="mixed"
            neutral
            delaySec={0.95}
          />
          <Figure
            label={t("Acierto medio", "Average win rate")}
            hint={t("Porcentaje medio de operaciones cerradas con beneficio. Un acierto bajo puede ser rentable si las ganancias son mayores que las pérdidas. El tiempo en mercado es la parte del periodo con una posición abierta.", "Average share of closed trades with a profit. A low win rate can be profitable if gains are larger than losses. Time in the market is the part of the period with an open position.")}
            value={summary.meanWinRatePct === null ? "—" : f.pct(summary.meanWinRatePct, 0)}
            sub={summary.meanExposurePct === null ? undefined : t(`en mercado el ${f.pct(summary.meanExposurePct, 0)} del tiempo`, `in the market ${f.pct(summary.meanExposurePct, 0)} of the time`)}
            tone="mixed"
            neutral
            delaySec={1.05}
          />
          <Figure
            label={t("Sharpe medio", "Average Sharpe")}
            hint={t("Rentabilidad por unidad de variabilidad (riesgo), promediada entre activos. Por encima de 1 se considera buena; entre 0 y 1, modesta para el riesgo asumido; por debajo de 0 hay pérdidas.", "Return per unit of variability (risk), averaged across assets. Above 1 is considered good; between 0 and 1, modest for the risk taken; below 0 there are losses.")}
            value={summary.meanSharpe === null ? "—" : f.ratio.format(summary.meanSharpe)}
            sub={summary.bestSharpe ? t(`el mejor: ${summary.bestSharpe.symbol} (${f.ratio.format(summary.bestSharpe.sharpe)})`, `the best: ${summary.bestSharpe.symbol} (${f.ratio.format(summary.bestSharpe.sharpe)})`) : undefined}
            tone={summary.meanSharpe === null ? "mixed" : summary.meanSharpe >= 1 ? "good" : summary.meanSharpe >= 0 ? "mixed" : "bad"}
            delaySec={1.15}
          />
          <Figure
            label={t("Órdenes en total", "Orders in total")}
            hint={t("Compras y ventas ejecutadas en todos los activos. Con muy pocas órdenes por activo, los resultados dependen de unas pocas operaciones y son menos fiables.", "Buys and sells executed across all assets. With very few orders per asset, results depend on a handful of trades and are less reliable.")}
            value={f.count.format(summary.totalOrders)}
            sub={t(`${f.count.format(Math.round(summary.totalOrders / c.ran))} por activo`, `${f.count.format(Math.round(summary.totalOrders / c.ran))} per asset`)}
            tone="mixed"
            neutral
            delaySec={1.25}
          />
        </dl>
      )}

      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3 text-caption text-muted-foreground">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Reveal>
  )
}

function Figure({
  label,
  value,
  sub,
  tone,
  neutral,
  delaySec,
  hint,
}: {
  label: string
  value: string
  sub?: string
  tone: "good" | "mixed" | "bad"
  neutral?: boolean
  delaySec: number
  hint?: string
}) {
  return (
    <div className={cn("bt-rise flex min-w-0 flex-col gap-0.5 rounded-lg p-3", neutral ? "bg-muted/50" : toneSoft(tone))} style={delay(delaySec)}>
      <dt className="flex items-center gap-1 text-caption text-muted-foreground">
        {label}
        {hint && <Hint title={label}>{hint}</Hint>}
      </dt>
      <dd className={cn("num text-title font-bold", !neutral && toneText(tone))}>{value}</dd>
      {sub && <dd className="num text-[11px] text-muted-foreground">{sub}</dd>}
    </div>
  )
}

/** The figures of a multi-asset run put into words, with the key terms. */
export function BatchReading({ summary }: { summary: BatchSummary }) {
  const { t, f } = useReplayText()
  const c = consistency(summary)
  if (c.ran === 0) return null
  const lines: string[] = [
    t(
      `La estrategia se aplicó por separado a ${c.ran} ${c.ran === 1 ? "activo" : "activos"}, cada uno con el capital inicial completo. Fue rentable en ${c.profitable} y superó a comprar y mantener en ${c.beatsHold}.`,
      `The strategy was applied separately to ${c.ran} ${c.ran === 1 ? "asset" : "assets"}, each with the full initial capital. It was profitable on ${c.profitable} and beat buying and holding on ${c.beatsHold}.`
    ),
  ]
  if (summary.meanReturnPct !== null && summary.medianReturnPct !== null) {
    const skew = Math.abs(summary.meanReturnPct - summary.medianReturnPct) > Math.max(5, Math.abs(summary.medianReturnPct) * 0.5)
    lines.push(
      t(
        `La rentabilidad media fue ${f.signedPct(summary.meanReturnPct)} y la mediana ${f.signedPct(summary.medianReturnPct)}.${skew ? " La diferencia entre ambas indica que uno o dos activos pesan mucho en la media; la mediana describe mejor el caso típico." : " Ambas cifras están próximas, así que el resultado no depende de un único activo."}`,
        `The average return was ${f.signedPct(summary.meanReturnPct)} and the median ${f.signedPct(summary.medianReturnPct)}.${skew ? " The gap between them means one or two assets weigh heavily on the average; the median describes the typical case better." : " Both figures are close, so the result doesn't hinge on a single asset."}`
      )
    )
  }
  if (summary.best && summary.worst && summary.meanDrawdownPct !== null)
    lines.push(
      t(
        `El mejor resultado fue ${summary.best.symbol} (${f.signedPct(summary.best.returnPct)}) y el peor ${summary.worst.symbol} (${f.signedPct(summary.worst.returnPct)}). De media, el capital llegó a caer un ${f.pct(summary.meanDrawdownPct)} desde su máximo en algún momento del periodo.`,
        `The best result was ${summary.best.symbol} (${f.signedPct(summary.best.returnPct)}) and the worst ${summary.worst.symbol} (${f.signedPct(summary.worst.returnPct)}). On average, the capital fell ${f.pct(summary.meanDrawdownPct)} from its peak at some point of the period.`
      )
    )
  if (summary.meanSharpe !== null)
    lines.push(
      t(
        `El Sharpe medio fue ${f.ratio.format(summary.meanSharpe)}: ${summary.meanSharpe >= 1 ? "una relación favorable entre rentabilidad y riesgo." : summary.meanSharpe >= 0 ? "una rentabilidad modesta para el riesgo asumido." : "la estrategia perdió dinero en relación con el riesgo asumido."}`,
        `The average Sharpe was ${f.ratio.format(summary.meanSharpe)}: ${summary.meanSharpe >= 1 ? "a favourable balance between return and risk." : summary.meanSharpe >= 0 ? "a modest return for the risk taken." : "the strategy lost money relative to the risk taken."}`
      )
    )
  const terms = [
    {
      term: t("Comprar y mantener", "Buy and hold"),
      text: t("Comprar el primer día y vender el último, sin operar.", "Buying on the first day and selling on the last, without trading."),
      more: t("Es la referencia mínima: si una estrategia no la supera, hacer nada habría dado más con menos esfuerzo y comisiones.", "It is the minimum benchmark: if a strategy doesn't beat it, doing nothing would have made more with less effort and fees."),
    },
    {
      term: t("Caída máxima", "Max drawdown"),
      text: t("La mayor bajada del capital desde un máximo anterior.", "The largest fall of the capital from a previous peak."),
      more: t("No es una pérdida definitiva, sino la peor racha que habría que soportar. Una caída del 50 % exige ganar un 100 % para recuperarse.", "It is not a final loss but the worst stretch you would have to endure. A 50 % drop needs a 100 % gain to recover."),
    },
    {
      term: "Sharpe",
      text: t("Rentabilidad obtenida por cada unidad de riesgo.", "Return earned per unit of risk."),
      more: t("Compara la rentabilidad con lo mucho que oscila el capital. Dos estrategias con la misma ganancia no son iguales si una lo consigue con muchos más sobresaltos.", "It compares the return with how much the capital swings. Two strategies with the same gain aren't equal if one gets there with far more swings."),
    },
    {
      term: t("Factor de beneficio", "Profit factor"),
      text: t("Ganancias totales divididas entre pérdidas totales.", "Total gains divided by total losses."),
      more: t("Por encima de 1 la estrategia gana más de lo que pierde; 1,5 o más suele considerarse sólido.", "Above 1 the strategy makes more than it loses; 1.5 or more is usually considered solid."),
    },
  ]
  return <ReadingPanel label={t("Lectura de los resultados", "Reading the results")} title={t("Lectura de los resultados", "Reading the results")} lines={lines} terms={terms} />
}

// --- Strategy against buy and hold -------------------------------------------------------------

const SCATTER_H = 300
const SC = { l: 46, r: 14, t: 12, b: 34 }

/** Each asset as a dot: the strategy's return against buying and holding. Above the line it won. */
export function StrategyVsHold({ rows, onOpen }: { rows: BatchRow[]; onOpen: (symbol: string) => void }) {
  const { t, f } = useReplayText()
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const [hover, setHover] = useState<string | null>(null)
  const ran = rows.filter((r) => r.ran)
  const W = Math.max(width, 280)
  const [lo, hi] = pad(extent([...ran.map((r) => r.benchmarkReturnPct), ...ran.map((r) => r.returnPct), 0]), 0.1)
  const x = linear(lo, hi, SC.l, W - SC.r)
  const y = linear(lo, hi, SCATTER_H - SC.b, SC.t)
  const ticks = niceTicks(lo, hi, 5)
  const tag = (v: number) => f.pct(v, 0)
  const hv = ran.find((r) => r.symbol === hover)

  return (
    <Reveal
      label={t("Estrategia frente a mantener", "Strategy versus holding")}
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="flex items-center gap-1.5 font-bold">
          {t("Estrategia frente a comprar y mantener", "Strategy versus buy and hold")}
          <InfoHint title={t("Cómo leer este gráfico", "How to read this chart")}>
            <p>
              {t(
                "Cada punto es un activo. Horizontal: lo que habría ganado comprando al principio y esperando. Vertical: lo que ganó la estrategia.",
                "Each dot is an asset. Horizontal: what buying at the start and waiting would have made. Vertical: what the strategy made."
              )}
            </p>
            <p>
              {t(
                "Por encima de la diagonal, la estrategia superó a mantener; por debajo, habría sido mejor no hacer nada.",
                "Above the diagonal the strategy beat holding; below it, doing nothing would have been better."
              )}
            </p>
          </InfoHint>
        </h3>
        <p className="text-caption text-muted-foreground">
          {t("Por encima de la diagonal: la estrategia gana a mantener.", "Above the diagonal: the strategy beats holding.")}
        </p>
      </header>
      <div ref={ref} className="relative min-w-0">
        {hv && (
          <ChartTip x={x(hv.benchmarkReturnPct)} y={y(hv.returnPct)} width={W} height={SCATTER_H}>
            <TipTitle>{hv.symbol}</TipTitle>
            <TipRow label={t("Estrategia", "Strategy")} value={f.signedPct(hv.returnPct)} valueColour={signVar(hv.returnPct)} strong />
            <TipRow label={t("Comprar y mantener", "Buy and hold")} value={f.signedPct(hv.benchmarkReturnPct)} />
            <TipRow label={t("Diferencia", "Difference")} value={f.pts(hv.excessPct)} valueColour={signVar(hv.excessPct)} />
            <p className="text-[10px] text-muted-foreground">{t("Pulsa para abrir su informe", "Click to open its report")}</p>
          </ChartTip>
        )}
        {ran.length === 0 ? null : (
          <svg width={W} height={SCATTER_H} role="img" aria-label={t("Dispersión de la estrategia frente a mantener", "Scatter of the strategy against holding")}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={SC.l} x2={W - SC.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} opacity={v === 0 ? 1 : 0.5} />
                <line x1={x(v)} x2={x(v)} y1={SC.t} y2={SCATTER_H - SC.b} stroke="var(--border)" strokeWidth={1} opacity={v === 0 ? 1 : 0.5} />
                <text x={SC.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                  {tag(v)}
                </text>
                <text x={x(v)} y={SCATTER_H - SC.b + 14} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                  {tag(v)}
                </text>
              </g>
            ))}
            <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="var(--muted-foreground)" strokeWidth={1.25} strokeDasharray="4 4" />
            <text x={W - SC.r} y={SCATTER_H - 6} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {t("Comprar y mantener →", "Buy and hold →")}
            </text>
            <text x={10} y={SC.t + 8} fontSize={10} fill="var(--muted-foreground)" transform={`rotate(-90 10 ${SC.t + 8})`} textAnchor="end">
              {t("Estrategia →", "Strategy →")}
            </text>
            {ran.map((r) => {
              const cx = x(r.benchmarkReturnPct)
              const cy = y(r.returnPct)
              const wins = r.excessPct > 0
              const active = hover === r.symbol
              return (
                <g
                  key={r.symbol}
                  tabIndex={0}
                  role="button"
                  aria-label={`${r.symbol}: ${t("estrategia", "strategy")} ${f.signedPct(r.returnPct)}, ${t("mantener", "hold")} ${f.signedPct(r.benchmarkReturnPct)}`}
                  className="cursor-pointer outline-none"
                  onPointerEnter={() => setHover(r.symbol)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(r.symbol)}
                  onBlur={() => setHover(null)}
                  onClick={() => onOpen(r.symbol)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(r.symbol)}
                >
                  {active && <line x1={cx} x2={cx} y1={cy} y2={y(hv?.benchmarkReturnPct ?? 0)} stroke="var(--foreground)" strokeDasharray="3 3" opacity={0.5} />}
                  <circle cx={cx} cy={cy} r={active ? 8 : 6} fill={wins ? "var(--up)" : "var(--down)"} fillOpacity={hover === null || active ? 0.9 : 0.4} stroke={active ? "var(--foreground)" : "var(--card)"} strokeWidth={2} />
                  <circle cx={cx} cy={cy} r={14} fill="transparent" />
                  <text x={cx} y={cy - 11} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--foreground)">
                    {r.symbol}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </Reveal>
  )
}

// --- Risk and return ----------------------------------------------------------------------------

const RR_H = 300
const RR = { l: 46, r: 14, t: 12, b: 38 }

/** Each asset as a dot: what the strategy made against how far it fell. Top left is best. */
export function RiskReturn({ rows, onOpen }: { rows: BatchRow[]; onOpen: (symbol: string) => void }) {
  const { t, f } = useReplayText()
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const [hover, setHover] = useState<string | null>(null)
  const ran = rows.filter((r) => r.ran)
  const W = Math.max(width, 280)
  const xMax = Math.max(5, ...ran.map((r) => r.maxDrawdownPct)) * 1.1
  const [lo, hi] = pad(extent([...ran.map((r) => r.returnPct), 0]), 0.12)
  const x = linear(0, xMax, RR.l, W - RR.r)
  const y = linear(lo, hi, RR_H - RR.b, RR.t)
  const hv = ran.find((r) => r.symbol === hover)
  return (
    <Reveal label={t("Ganancia frente a caída", "Gain against drop")} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-col gap-0.5">
        <h3 className="flex items-center gap-1.5 font-bold">
          {t("Ganancia frente a caída", "Gain against drop")}
          <InfoHint title={t("Cómo leer este gráfico", "How to read this chart")}>
            <p>
              {t(
                "Cada punto es un activo. Horizontal: lo más que llegó a caer el capital desde su máximo. Vertical: lo que ganó la estrategia.",
                "Each dot is an asset. Horizontal: the most the capital fell from its peak. Vertical: what the strategy made."
              )}
            </p>
            <p>{t("Arriba a la izquierda es lo mejor: gana mucho y cae poco.", "Top left is best: it makes a lot and falls little.")}</p>
          </InfoHint>
        </h3>
        <p className="text-caption text-muted-foreground">{t("Arriba a la izquierda: gana mucho y cae poco.", "Top left: it makes a lot and falls little.")}</p>
      </header>
      <div ref={ref} className="relative min-w-0">
        {hv && (
          <ChartTip x={x(hv.maxDrawdownPct)} y={y(hv.returnPct)} width={W} height={RR_H}>
            <TipTitle>{hv.symbol}</TipTitle>
            <TipRow label={t("Estrategia", "Strategy")} value={f.signedPct(hv.returnPct)} valueColour={signVar(hv.returnPct)} strong />
            <TipRow label={t("Caída máxima", "Max drawdown")} value={`−${f.pct(hv.maxDrawdownPct)}`} />
            <TipRow label="Sharpe" value={f.ratio.format(hv.sharpe)} />
            <TipRow label={t("Factor de beneficio", "Profit factor")} value={hv.profitFactor === null ? "—" : f.ratio.format(hv.profitFactor)} />
          </ChartTip>
        )}
        {ran.length > 0 && (
          <svg width={W} height={RR_H} role="img" aria-label={t("Dispersión de ganancia y caída", "Scatter of gain and drop")}>
            {niceTicks(lo, hi, 5).map((v) => (
              <g key={v}>
                <line x1={RR.l} x2={W - RR.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} opacity={v === 0 ? 1 : 0.5} strokeDasharray={v === 0 ? undefined : "2 4"} />
                <text x={RR.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                  {f.pct(v, 0)}
                </text>
              </g>
            ))}
            {niceTicks(0, xMax, 5).map((v) => (
              <text key={v} x={x(v)} y={RR_H - RR.b + 14} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                {f.pct(v, 0)}
              </text>
            ))}
            <text x={W - RR.r} y={RR_H - 6} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {t("Caída máxima →", "Max drawdown →")}
            </text>
            {ran.map((r) => {
              const cx = x(r.maxDrawdownPct)
              const cy = y(r.returnPct)
              const active = hover === r.symbol
              return (
                <g
                  key={r.symbol}
                  tabIndex={0}
                  role="button"
                  aria-label={`${r.symbol}: ${t("estrategia", "strategy")} ${f.signedPct(r.returnPct)}, ${t("caída máxima", "max drawdown")} ${f.pct(r.maxDrawdownPct)}`}
                  className="cursor-pointer outline-none"
                  onPointerEnter={() => setHover(r.symbol)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(r.symbol)}
                  onBlur={() => setHover(null)}
                  onClick={() => onOpen(r.symbol)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(r.symbol)}
                >
                  <circle cx={cx} cy={cy} r={active ? 8 : 6} fill={r.returnPct >= 0 ? "var(--up)" : "var(--down)"} fillOpacity={hover === null || active ? 0.9 : 0.4} stroke={active ? "var(--foreground)" : "var(--card)"} strokeWidth={2} />
                  <circle cx={cx} cy={cy} r={14} fill="transparent" />
                  <text x={cx} y={cy - 11} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--foreground)">
                    {r.symbol}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </Reveal>
  )
}

// --- Every curve together -----------------------------------------------------------------------

const CV_H = 300
const CV = { l: 50, r: 76, t: 14, b: 28 }
const CV_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)"]

/** The equity of every asset over the same chart (each starting from 100), with the median and the central band. */
export function CurvesOverlay({ tiles, timeline }: { tiles: TileData[]; timeline: Timeline }) {
  const { t, f } = useReplayText()
  const id = useSvgId()
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const W = Math.max(width, 320)
  const hover = useChartHover(W, CV_H)
  const curves = tiles.flatMap((tile) => (tile.result ? [{ symbol: tile.symbol, curve: tile.result.equityCurve }] : []))
  const fan = fanOf(curves.map((c) => c.curve))
  const [lo, hi] = pad(extent([100, ...curves.flatMap((c) => c.curve)]), 0.06)
  const x = (at: number) => CV.l + at * (W - CV.l - CV.r)
  const y = linear(lo, hi, CV_H - CV.b, CV.t)
  const useColours = curves.length <= 6
  const path = (curve: number[]) => resample(curve, 48).map((v, k) => ({ x: x(k / 47), y: y(v) }))
  const ends = curves.map((c) => y(c.curve.at(-1) ?? 100))
  const labelYs = spreadOut(ends, 14, CV.t + 6, CV_H - CV.b - 2)
  const spread = (values: number[]) => values.map((v, k) => ({ x: x(k / Math.max(1, values.length - 1)), y: y(v) }))
  const colourOf = (i: number) => (useColours ? CV_PALETTE[i % CV_PALETTE.length] : (curves[i].curve.at(-1) ?? 100) >= 100 ? "var(--up)" : "var(--down)")
  // With many assets only the best and the worst get a label.
  const best = ends.indexOf(Math.min(...ends))
  const worst = ends.indexOf(Math.max(...ends))
  if (curves.length === 0) return null
  const upper = spread(fan.upper)
  const lower = spread(fan.lower)
  const sampled = curves.map((c, i) => ({ symbol: c.symbol, colour: colourOf(i), values: resample(c.curve, 48) }))
  const hk = hover.at ? indexAtX(hover.at.x, CV.l, W - CV.r, 48) : null
  const hx = hk === null ? 0 : x(hk / 47)
  const atHover = hk === null ? [] : [...sampled].sort((a, b) => b.values[hk] - a.values[hk])
  const shownRows = atHover.length <= 8 ? atHover : [...atHover.slice(0, 3), ...atHover.slice(-3)]
  return (
    <Reveal label={t("Todas las curvas", "Every curve")} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-col gap-0.5">
        <h3 className="font-bold">{t("Todas las curvas juntas", "All the curves together")}</h3>
        <p className="text-caption text-muted-foreground">
          {t(
            "Cada línea es el capital de un activo (100 = el inicial en su primera vela). La gruesa es la mediana y la banda, el 50 % central.",
            "Each line is one asset's equity (100 = the start on its first candle). The thick one is the median and the band, the central 50 %."
          )}
        </p>
      </header>
      <div ref={ref} className="relative min-w-0">
        <svg width={W} height={CV_H} role="img" aria-label={t("Curvas de capital de todos los activos", "Equity curves of every asset")} className="touch-pan-y" {...hover.bind}>
          <VizDefs id={id} />
          {niceTicks(lo, hi, 5).map((v) => (
            <g key={v}>
              <line x1={CV.l} x2={W - CV.r} y1={y(v)} y2={y(v)} stroke={v === 100 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={v === 100 ? undefined : "2 5"} opacity={0.8} />
              <text x={CV.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                {f.signedPct(v - 100, 0)}
              </text>
            </g>
          ))}
          {upper.length > 1 && <path d={`${linePath(upper)}${[...lower].reverse().map((q) => `L${q.x} ${q.y}`).join("")}Z`} fill="var(--primary)" opacity={0.12} />}
          {curves.map((c, i) => (
            <path key={c.symbol} d={linePath(path(c.curve))} fill="none" stroke={colourOf(i)} strokeWidth={useColours ? 1.8 : 1.2} opacity={useColours ? 0.9 : 0.4} strokeLinejoin="round" />
          ))}
          <path d={linePath(spread(fan.median))} fill="none" stroke="var(--foreground)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} filter={glow(id)} />
          {curves.map((c, i) =>
            useColours || i === best || i === worst ? (
              <Tag key={c.symbol} x={W - CV.r + 6} y={labelYs[i]} anchor="start" size={10} text={`${c.symbol} ${f.signedPct((c.curve.at(-1) ?? 100) - 100, 0)}`} colour={colourOf(i)} />
            ) : null
          )}
          {hk !== null && (
            <>
              <Crosshair x={hx} top={CV.t} bottom={CV_H - CV.b} />
              {sampled.map((c) => (
                <HoverDot key={c.symbol} x={hx} y={y(c.values[hk])} colour={c.colour} r={useColours ? 3.5 : 2.5} />
              ))}
              <HoverDot x={hx} y={y(fan.median[hk])} colour="var(--foreground)" />
            </>
          )}
        </svg>
        {hk !== null && (
          <ChartTip x={hx} y={y(fan.median[hk])} width={W} height={CV_H}>
            <TipTitle>{f.date.format(new Date(timeline.fromMs + (hk / 47) * (timeline.toMs - timeline.fromMs)))}</TipTitle>
            <TipRow label={t("Mediana", "Median")} value={f.signedPct(fan.median[hk] - 100)} colour="var(--foreground)" valueColour={signVar(fan.median[hk] - 100)} strong />
            {shownRows.map((c, k) => (
              <TipRow key={c.symbol} label={`${atHover.length > 8 && k === 3 ? "… " : ""}${c.symbol}`} value={f.signedPct(c.values[hk] - 100)} colour={c.colour} valueColour={signVar(c.values[hk] - 100)} />
            ))}
          </ChartTip>
        )}
      </div>
    </Reveal>
  )
}

// --- Table -------------------------------------------------------------------------------------

type Column = { key: SortKey; label: string; align?: "right"; render: (row: BatchRow) => React.ReactNode }

/** Sortable table of the figures per asset; a row opens that asset's full report. */
export function BatchTable({ result, from, onOpen }: { result: AssetsBatchResult; /** Requested start (YYYY-MM-DD). */ from: string; onOpen: (symbol: string) => void }) {
  const { t, f } = useReplayText()
  const rows = useMemo(() => batchRows(result), [result])
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "returnPct", dir: "desc" })
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort])
  const toneOf = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "")
  const columns: Column[] = [
    {
      key: "symbol",
      label: t("Activo", "Asset"),
      render: (r) => (
        <span className="flex items-center gap-2">
          <AssetAvatar symbol={r.symbol} size={24} />
          <span className="font-semibold">{r.symbol}</span>
          {r.startsAt && Date.parse(r.startsAt) - Date.parse(from) >= 86_400_000 && (
            <Badge variant="outline" className="h-5 px-1.5 font-sans" title={t("Su histórico empieza después del inicio del rango.", "Its history starts after the start of the range.")}>
              {t("desde", "from")} {f.month.format(new Date(r.startsAt))}
            </Badge>
          )}
        </span>
      ),
    },
    { key: "returnPct", label: t("Estrategia", "Strategy"), align: "right", render: (r) => <span className={cn("font-semibold", toneOf(r.returnPct))}>{f.signedPct(r.returnPct)}</span> },
    { key: "benchmarkReturnPct", label: t("Mantener", "Hold"), align: "right", render: (r) => <span className={toneOf(r.benchmarkReturnPct)}>{f.signedPct(r.benchmarkReturnPct)}</span> },
    { key: "excessPct", label: t("Diferencia", "Difference"), align: "right", render: (r) => <span className={cn("font-semibold", toneOf(r.excessPct))}>{f.pts(r.excessPct)}</span> },
    { key: "maxDrawdownPct", label: t("Caída máx.", "Max drawdown"), align: "right", render: (r) => `−${f.pct(r.maxDrawdownPct)}` },
    { key: "winRatePct", label: t("Acierto", "Win rate"), align: "right", render: (r) => f.pct(r.winRatePct, 0) },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => f.ratio.format(r.sharpe) },
    { key: "trades", label: t("Órdenes", "Orders"), align: "right", render: (r) => f.count.format(r.trades) },
    { key: "profitFactor", label: t("Fact. benef.", "Profit f."), align: "right", render: (r) => (r.profitFactor === null ? "—" : f.ratio.format(r.profitFactor)) },
    { key: "exposurePct", label: t("En mercado", "In market"), align: "right", render: (r) => f.pct(r.exposurePct, 0) },
    { key: "finalCapital", label: t("Capital final", "Final capital"), align: "right", render: (r) => f.usdt(r.finalCapital) },
  ]
  return (
    <Reveal label={t("Resultados por activo", "Results by asset")} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-col gap-0.5">
        <h3 className="font-bold">{t("Resultados por activo", "Results by asset")}</h3>
        <p className="text-caption text-muted-foreground">
          {t("Pulsa una columna para ordenar y una fila para abrir su informe completo.", "Click a column to sort and a row to open its full report.")}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-caption">
          <thead>
            <tr className="border-b text-muted-foreground">
              {columns.map((c) => {
                const active = sort.key === c.key
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-2 py-2 font-semibold", c.align === "right" && "text-right")}>
                    <button
                      type="button"
                      onClick={() => setSort({ key: c.key, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
                      className={cn("inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50", active && "text-foreground")}
                    >
                      {c.label}
                      {active ? sort.dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" /> : <ChevronsUpDownIcon className="size-3 opacity-50" />}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.symbol}
                tabIndex={r.ran ? 0 : undefined}
                onClick={r.ran ? () => onOpen(r.symbol) : undefined}
                onKeyDown={r.ran ? (e) => e.key === "Enter" && onOpen(r.symbol) : undefined}
                className={cn("num border-b last:border-b-0", r.ran ? "cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/50" : "text-muted-foreground opacity-70")}
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-2 py-2", c.align === "right" && "text-right")}>
                    {r.ran || i === 0 ? c.render(r) : i === 1 ? <span className="font-sans">{t("Sin velas suficientes", "Not enough candles")}</span> : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Reveal>
  )
}
