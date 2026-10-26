"use client"

import { useMemo, useState } from "react"
import { SparklesIcon } from "lucide-react"
import { cn } from "cn"
import type { RunSummary, SensitivityBatchRequest, SensitivityBatchResult } from "@/lib/backtests"
import { areaPath, clamp, easeOutBack, easeOutCubic, extent, histogram, linePath, linear, niceTicks, pad } from "@/lib/chart-geometry"
import { numberFormat } from "@/lib/format"
import { axisProfiles, cellReveal, isBaseCell, rankedCells, revealOrder, sensitivityReport, sensitivityStats, tableCsv, type Criterion } from "@/lib/robustness-report"
import { useReplayText } from "../replay/format"
import { Hint } from "./hover"
import { RobustFrame, RobustVerdict, type RobustRun } from "./robust-frame"
import { downloadText } from "./download"
import { Spark } from "./spark"
import { fieldLabel, kindLabel } from "./test-meta"
import { ChartTip, Crosshair, HoverDot, indexAtX, TipRow, TipTitle, useChartHover } from "./hover"
import { glow, LegendRow, Narration, paint, ReadingPanel, Ring, signVar, StatTile, trianglePath, useSvgId, VizDefs } from "./viz"

type Run = SensitivityBatchRequest & Pick<RobustRun, "mode">
type Cell = SensitivityBatchResult["cells"][number]

/** Share of the animation spent filling the cells (the rest lets the last ones settle). */
const FILL_UNTIL = 0.92

const CELL_W = 100
const CELL_H = 64
const LEFT = 150
const TOP = 56
const BINS = 9

/** Fill of a cell: green for gains, red for losses, deeper the further from zero. */
function cellFill(returnPct: number, scale: number) {
  const strength = Math.round(18 + clamp(Math.abs(returnPct) / scale) * 62)
  return `color-mix(in oklab, var(${returnPct >= 0 ? "--up" : "--down"}) ${strength}%, transparent)`
}

/** Parameter sensitivity: a heat map that fills cell by cell, rippling out from the original variant. */
export function SensitivityView({
  run,
  result,
  onClose,
  expanded,
  onExpandedChange,
}: {
  run: Run
  result: SensitivityBatchResult
  onClose: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const { locale, t, f } = useReplayText()
  const id = useSvgId()
  const report = useMemo(() => sensitivityReport(result), [result])
  const stats = useMemo(() => sensitivityStats(result), [result])
  const profiles = useMemo(() => axisProfiles(result), [result])
  const ranked = useMemo(() => rankedCells(result, 3), [result])
  const order = useMemo(() => revealOrder(result.cells), [result.cells])
  const rankOf = useMemo(() => {
    const ranks = new Array<number>(order.length)
    order.forEach((cell, rank) => (ranks[cell] = rank))
    return ranks
  }, [order])
  const baseIndex = useMemo(() => result.cells.findIndex(isBaseCell), [result.cells])
  const [selected, setSelected] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const num = useMemo(() => numberFormat(locale, { maximumFractionDigits: 2 }), [locale])

  const two = result.axes.length === 2
  const rows = result.axes[0].values.length
  const cols = two ? result.axes[1].values.length : 1
  // With one axis the five variants run along the row, taller to fill the space.
  const horizontal = !two
  const gridCols = horizontal ? rows : cols
  const gridRows = horizontal ? 1 : rows
  const cw = horizontal ? 124 : CELL_W
  const ch = horizontal ? 128 : CELL_H
  const left = horizontal ? 24 : LEFT
  const width = left + gridCols * cw + 16
  const height = TOP + gridRows * ch + (horizontal ? 70 : 28)
  const returnsAll = result.cells.flatMap((c) => (c.summary ? [c.summary.returnPct] : []))
  const scale = Math.max(5, ...returnsAll.map(Math.abs))
  const [domLo, domHi] = pad(extent(returnsAll.length ? returnsAll : [0, 1]), 0.04)
  const edges = Array.from({ length: BINS - 1 }, (_, k) => domLo + ((k + 1) / BINS) * (domHi - domLo))
  const posOf = (cell: Cell) => (horizontal ? { r: 0, c: cell.coords[0] } : { r: cell.coords[0], c: cell.coords[1] })
  const centreOf = (cell: Cell) => {
    const { r, c } = posOf(cell)
    return { x: left + c * cw + cw / 2, y: TOP + r * ch + ch / 2 }
  }
  const baseCentre = baseIndex >= 0 ? centreOf(result.cells[baseIndex]) : { x: width / 2, y: TOP + (gridRows * ch) / 2 }
  const maxReach = Math.max(1, ...result.cells.map((c) => Math.hypot(centreOf(c).x - baseCentre.x, centreOf(c).y - baseCentre.y)))

  const axisName = (k: number) => {
    const axis = result.axes[k]
    const side = run.strategy.rules[axis.ruleIndex]?.side === "sell" ? t("Venta", "Sell") : t("Compra", "Buy")
    return `${side} · ${kindLabel(axis.kind, t)} ${fieldLabel(axis.field, t)}`
  }
  const levelText = (l: number) => `${l > 0 ? "+" : l < 0 ? "−" : ""}${Math.round(Math.abs(l) * 100)} %`
  const valuesText = (cell: Cell) => cell.values.map((v) => num.format(v)).join(" · ")

  const revealed = (pos: number) => {
    const progress = clamp(pos / (FILL_UNTIL * 360))
    return result.cells.map((_, i) => cellReveal(rankOf[i], result.cells.length, progress))
  }

  const csv = () => {
    const headers = [
      ...result.axes.map((_, k) => axisName(k)),
      ...(locale === "es"
        ? ["Estrategia %", "Mantener %", "Caída máx. %", "Acierto %", "Sharpe", "Factor de beneficio", "Órdenes", "Estado"]
        : ["Strategy %", "Hold %", "Max drawdown %", "Win rate %", "Sharpe", "Profit factor", "Orders", "Status"]),
    ]
    const rowsOut = result.cells.map((c) => [...c.values, c.summary?.returnPct ?? null, c.summary?.benchmarkReturnPct ?? null, c.summary?.maxDrawdownPct ?? null, c.summary?.winRatePct ?? null, c.summary?.sharpe ?? null, c.summary?.profitFactor ?? null, c.summary?.orders ?? null, c.error ?? "ok"])
    downloadText(`backtestlab-sensitivity-${run.symbol.toLowerCase()}-${run.timeframe}-${run.from}_${run.to}.csv`, tableCsv(headers, rowsOut, locale))
  }

  const format = (c: Criterion) => {
    if (c.value === null) return c.id === "plateau" ? t("Original sin ganancia", "Original not profitable") : "—"
    if (c.id === "profitable" || c.id === "plateau") return `${Math.round(c.value * 100)} %`
    return f.signedPct(c.value)
  }

  const notes: string[] = []
  if (report.skipped > 0)
    notes.push(
      t(
        `${f.plural(report.skipped, "variante no se ejecutó", "variantes no se ejecutaron")}: sus valores dejaban una condición inválida o hacían que las reglas se contradijeran (su cupo se devolvió).`,
        `${report.skipped} ${report.skipped === 1 ? "variant wasn't" : "variants weren't"} run: their values left a condition invalid or made the rules contradict each other (their quota was given back).`
      )
    )
  notes.push(
    t(
      "Cada celda es un backtest completo del mismo rango con el capital inicial; la celda marcada es la estrategia tal como la guardaste.",
      "Each cell is a full backtest of the same range with the initial capital; the marked cell is the strategy as you saved it."
    )
  )

  const names = result.axes.map((_, k) => axisName(k))
  const pctOf = (v: number) => `${Math.round(v * 100)} %`
  const reading: string[] = []
  if (report.ran > 0) {
    reading.push(
      t(
        `Se probaron ${report.ran} combinaciones de ${names.join(" y ")}, desde un 20 % por debajo hasta un 20 % por encima de tus valores. ${report.profitable} de ellas (${pctOf(report.profitable / report.ran)}) terminaron con beneficio.`,
        `${report.ran} combinations of ${names.join(" and ")} were tested, from 20 % below to 20 % above your values. ${report.profitable} of them (${pctOf(report.profitable / report.ran)}) ended with a profit.`
      )
    )
    if (report.baseReturnPct !== null && report.neighborReturnPct !== null) {
      const verdict =
        report.retention === null
          ? t("Como tu configuración no fue rentable, la comparación con las vecinas no es concluyente.", "As your configuration wasn't profitable, the comparison with its neighbours isn't conclusive.")
          : report.retention >= 0.7
            ? t("El resultado apenas cambia al mover los parámetros: es la estabilidad que se busca.", "The result barely changes when the parameters move: that is the stability you look for.")
            : report.retention < 0.4
              ? t("El rendimiento cae con rapidez al alejarse de tus valores: es probable que estén ajustados en exceso a este periodo.", "Performance drops quickly away from your values: they are probably fitted too closely to this period.")
              : t("El rendimiento se mantiene solo en parte: conviene confirmarlo con otro rango de fechas.", "Performance only partly holds: confirm it on another date range.")
      reading.push(
        t(
          `Tu configuración obtuvo ${f.signedPct(report.baseReturnPct)}; la media de las combinaciones más próximas fue ${f.signedPct(report.neighborReturnPct)}${report.retention === null ? "" : ` (el ${pctOf(report.retention)} de la tuya)`}. ${verdict}`,
          `Your configuration made ${f.signedPct(report.baseReturnPct)}; the closest combinations averaged ${f.signedPct(report.neighborReturnPct)}${report.retention === null ? "" : ` (${pctOf(report.retention)} of yours)`}. ${verdict}`
        )
      )
    }
    if (stats)
      reading.push(
        t(
          `Entre la mejor variante (${f.signedPct(stats.max)}) y la peor (${f.signedPct(stats.min)}) hay ${f.decimal1.format(stats.spread)} puntos de diferencia, y la mediana fue ${f.signedPct(stats.median)}. Cuanto más estrecho es ese margen, menos depende la estrategia de un ajuste fino.`,
          `Between the best variant (${f.signedPct(stats.max)}) and the worst (${f.signedPct(stats.min)}) there are ${f.decimal1.format(stats.spread)} points, and the median was ${f.signedPct(stats.median)}. The narrower that margin, the less the strategy depends on fine tuning.`
        )
      )
  }
  const terms = [
    {
      term: t("Variante", "Variant"),
      text: t("Copia de tu estrategia con uno o dos parámetros modificados.", "A copy of your strategy with one or two parameters changed."),
      more: t("Cada variante es un backtest completo con el mismo activo, fechas, capital y comisiones; solo cambian los valores indicados.", "Each variant is a full backtest with the same asset, dates, capital and fees; only the values shown change."),
    },
    {
      term: t("Meseta", "Plateau"),
      text: t("Zona amplia de la matriz con resultados parecidos.", "A wide area of the grid with similar results."),
      more: t("Indica que la estrategia no depende de unos valores exactos: si el mercado cambia un poco, es más probable que siga funcionando.", "It means the strategy doesn't depend on exact values: if the market changes a little, it is more likely to keep working."),
    },
    {
      term: t("Sobreajuste", "Overfitting"),
      text: t("Reglas adaptadas en exceso a los datos pasados.", "Rules fitted too closely to past data."),
      more: t("Se reconoce por un único valor muy rentable rodeado de variantes mediocres o con pérdidas. Lo que funcionó en el pasado por coincidencia rara vez se repite.", "You spot it as a single very profitable value surrounded by mediocre or losing variants. What worked in the past by coincidence rarely repeats."),
    },
    {
      term: t("Nivel (−20 % … +20 %)", "Level (−20 % … +20 %)"),
      text: t("Cuánto se aleja cada parámetro de tu valor original.", "How far each parameter is from your original value."),
    },
  ]

  const detailIndex = selected ?? (baseIndex >= 0 ? baseIndex : 0)
  const detail = result.cells[detailIndex]

  return (
    <RobustFrame
      run={{ ...run }}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      onClose={onClose}
      label={t("Reproducción de la sensibilidad de parámetros", "Parameter sensitivity replay")}
      dateAt={(pos) => {
        const done = revealed(pos).filter((a) => a >= 1).length
        return t(`Variante ${done} de ${result.cells.length}`, `Variant ${done} of ${result.cells.length}`)
      }}
      counterAt={(pos) => {
        const a = revealed(pos)
        const wins = result.cells.filter((c, i) => a[i] >= 1 && (c.summary?.returnPct ?? 0) > 0).length
        return t(`${wins} rentables`, `${wins} profitable`)
      }}
      onCsv={csv}
      animation={(pos, finished) => {
        const alpha = revealed(pos)
        const progress = clamp(pos / (FILL_UNTIL * 360))
        const shown = result.cells.filter((_, i) => alpha[i] >= 1)
        const withSummary = shown.filter((c) => c.summary)
        const winning = withSummary.filter((c) => (c.summary?.returnPct ?? 0) > 0).length
        const best = withSummary.reduce<Cell | null>((b, c) => (!b || (c.summary?.returnPct ?? 0) > (b.summary?.returnPct ?? 0) ? c : b), null)
        const worst = withSummary.reduce<Cell | null>((b, c) => (!b || (c.summary?.returnPct ?? 0) < (b.summary?.returnPct ?? 0) ? c : b), null)
        const counts = histogram(withSummary.map((c) => c.summary!.returnPct), edges)
        const maxCount = Math.max(1, ...histogram(returnsAll, edges))
        const wave = progress * maxReach * 1.08
        const pulse = 0.5 + 0.5 * Math.sin(pos / 6)
        const doneAll = progress >= 1
        const hv = hover !== null && alpha[hover] >= 1 ? hover : null
        const hvCell = hv === null ? null : result.cells[hv]
        const hvPos = hvCell ? posOf(hvCell) : null
        const hvCentre = hvCell ? centreOf(hvCell) : null
        const original = baseIndex >= 0 ? result.cells[baseIndex].summary : null
        const inLine = (cell: Cell) => {
          if (!hvPos) return true
          const at = posOf(cell)
          return at.r === hvPos.r || at.c === hvPos.c
        }

        const narration = doneAll
          ? t(
              `Resultado: ${winning} de ${withSummary.length} variantes ganan dinero. Una zona verde amplia (meseta) es buena señal; un único punto verde rodeado de rojo, sobreajuste.`,
              `Result: ${winning} of ${withSummary.length} variants make money. A wide green area (plateau) is a good sign; a single green spot surrounded by red means overfitting.`
            )
          : t(
              `Probando ${result.cells.length} versiones de la estrategia cambiando ${names.join(" y ")} entre −20 % y +20 %. Empieza por la tuya (marcada) y se aleja.`,
              `Trying ${result.cells.length} versions of the strategy, changing ${names.join(" and ")} between −20 % and +20 %. It starts at yours (marked) and moves away.`
            )

        return (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_17.5rem]">
            <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
              <Narration icon={<SparklesIcon className="text-primary" />}>{narration}</Narration>
              <div className="relative mx-auto w-full max-w-3xl">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={t("Mapa de calor del retorno según los parámetros", "Heat map of the return by parameters")}>
                <VizDefs id={id} />
                <defs>
                  <pattern id={`${id}-skip`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1={0} y1={0} x2={0} y2={8} stroke="var(--border-strong)" strokeWidth={2} />
                  </pattern>
                </defs>
                {/* Column header (the second axis, or the only one) */}
                <text x={left + (gridCols * cw) / 2} y={16} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--foreground)">
                  {axisName(two ? 1 : 0)}
                </text>
                {(two ? result.axes[1] : result.axes[0]).values.map((v, c) => (
                  <g key={c}>
                    <text x={left + c * cw + cw / 2} y={horizontal ? TOP + ch + 20 : 34} textAnchor="middle" fontSize={12} fontWeight={hvPos?.c === c ? 800 : 600} className="num" fill={hvPos?.c === c ? "var(--primary)" : "var(--foreground)"}>
                      {num.format(v)}
                    </text>
                    <text x={left + c * cw + cw / 2} y={horizontal ? TOP + ch + 36 : 48} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                      {levelText(result.axes[two ? 1 : 0].levels[c])}
                    </text>
                  </g>
                ))}
                {two && (
                  <>
                    <text transform={`translate(14 ${TOP + (rows * ch) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--foreground)">
                      {axisName(0)}
                    </text>
                    {result.axes[0].values.map((v, r) => (
                      <g key={r}>
                        <text x={left - 10} y={TOP + r * ch + ch / 2 - 2} textAnchor="end" fontSize={12} fontWeight={hvPos?.r === r ? 800 : 600} className="num" fill={hvPos?.r === r ? "var(--primary)" : "var(--foreground)"}>
                          {num.format(v)}
                        </text>
                        <text x={left - 10} y={TOP + r * ch + ch / 2 + 12} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                          {levelText(result.axes[0].levels[r])}
                        </text>
                      </g>
                    ))}
                  </>
                )}

                {/* Row and column of the cell under the pointer */}
                {hvPos && (
                  <g pointerEvents="none">
                    {two && <rect x={left - 4} y={TOP + hvPos.r * ch + 1} width={gridCols * cw + 8} height={ch - 2} rx={12} fill="var(--primary)" opacity={0.08} />}
                    <rect x={left + hvPos.c * cw + 1} y={TOP - 4} width={cw - 2} height={gridRows * ch + 8} rx={12} fill="var(--primary)" opacity={0.08} />
                  </g>
                )}

                {/* Wave that spreads out from the original variant */}
                {!doneAll && progress > 0 && (
                  <g pointerEvents="none">
                    <circle cx={baseCentre.x} cy={baseCentre.y} r={wave} fill="none" stroke="var(--primary)" strokeWidth={2.5} opacity={0.55 * (1 - progress)} filter={glow(id)} />
                    <circle cx={baseCentre.x} cy={baseCentre.y} r={Math.max(0, wave - maxReach * 0.14)} fill="none" stroke="var(--primary)" strokeWidth={1.2} opacity={0.3 * (1 - progress)} />
                  </g>
                )}

                {result.cells.map((cell, i) => {
                  const a = alpha[i]
                  if (a <= 0) return null
                  const { x: cx, y: cy } = centreOf(cell)
                  const land = easeOutBack(a)
                  const s = 0.7 + 0.3 * clamp(land, 0, 1.12)
                  const w = (cw - 6) * s
                  const h = (ch - 6) * s
                  const own = isBaseCell(cell)
                  const sum = cell.summary
                  const flash = (1 - a) * 0.9
                  const shownReturn = sum ? sum.returnPct * easeOutCubic(a) : 0
                  return (
                    <g
                      key={i}
                      opacity={Math.min(1, a * 2.2) * (inLine(cell) ? 1 : 0.42)}
                      onClick={() => setSelected(i)}
                      onPointerEnter={() => setHover(i)}
                      onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover((h) => (h === i ? null : h))}
                      className="cursor-pointer outline-none"
                      tabIndex={0}
                      role="button"
                      aria-label={`${valuesText(cell)}: ${sum ? f.signedPct(sum.returnPct) : t("no ejecutada", "not run")}`}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(i))}
                    >
                      <rect
                        x={cx - w / 2}
                        y={cy - h / 2}
                        width={w}
                        height={h}
                        rx={9}
                        fill={sum ? cellFill(sum.returnPct, scale) : `url(#${id}-skip)`}
                        stroke={hv === i ? "var(--foreground)" : own ? "var(--primary)" : detailIndex === i && finished ? "var(--foreground)" : "var(--border)"}
                        strokeWidth={hv === i ? 2.5 : own ? 2.5 + (doneAll ? pulse * 1.2 : 0) : detailIndex === i && finished ? 2 : 1}
                        filter={flash > 0.15 ? glow(id) : undefined}
                      />
                      {flash > 0.05 && <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={9} fill="none" stroke="var(--primary)" strokeWidth={2} opacity={flash} />}
                      {sum ? (
                        <>
                          <text x={cx} y={cy + (horizontal ? -2 : 1)} textAnchor="middle" fontSize={horizontal ? 19 : 14} fontWeight={800} className="num" fill="var(--foreground)">
                            {f.signedPct(shownReturn, 1)}
                          </text>
                          {a >= 0.99 && (
                            <>
                              <text x={cx} y={cy + (horizontal ? 20 : 16)} textAnchor="middle" fontSize={10} className="num" fill="var(--muted-foreground)">
                                −{f.pct(sum.maxDrawdownPct, 0)} · {sum.orders} {t("ord.", "ord.")}
                              </text>
                              <rect x={cx - (w - 22) / 2} y={cy + h / 2 - 7} width={(w - 22) * clamp(sum.maxDrawdownPct / 60)} height={2.5} rx={1.25} fill="var(--down)" opacity={0.7} />
                            </>
                          )}
                        </>
                      ) : (
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                          {cell.error === "conflict" ? t("contradicción", "conflict") : cell.error === "invalid" ? t("inválida", "invalid") : t("sin velas", "no candles")}
                        </text>
                      )}
                      {own && (
                        <text x={cx} y={cy - h / 2 + 12} textAnchor="middle" fontSize={9} fontWeight={800} fill="var(--primary)">
                          {t("ORIGINAL", "ORIGINAL")}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
              {hvCell && hvCentre && (
                <ChartTip x={hvCentre.x + cw * 0.3} y={hvCentre.y} width={width} height={height}>
                  {result.axes.map((axis, k) => (
                    <TipTitle key={k}>
                      {names[k]}: {num.format(hvCell.values[k])}{" "}
                      <span className="font-normal text-muted-foreground">({axis.levels[hvCell.coords[k]] === 0 ? t("valor original", "original value") : levelText(axis.levels[hvCell.coords[k]])})</span>
                    </TipTitle>
                  ))}
                  {hvCell.summary ? (
                    <>
                      <Spark curve={hvCell.summary.curve} hold={hvCell.summary.benchmarkCurve} width={150} height={34} className="my-0.5" />
                      <TipRow label={t("Rentabilidad", "Return")} value={f.signedPct(hvCell.summary.returnPct)} valueColour={signVar(hvCell.summary.returnPct)} strong />
                      <TipRow label={t("Comprar y mantener", "Buy and hold")} value={f.signedPct(hvCell.summary.benchmarkReturnPct)} />
                      <TipRow label={t("Caída máxima", "Max drawdown")} value={`−${f.pct(hvCell.summary.maxDrawdownPct)}`} />
                      <TipRow label={t("Operaciones ganadoras", "Winning trades")} value={hvCell.summary.roundTrips ? f.pct(hvCell.summary.winRatePct, 0) : "—"} />
                      <TipRow label={t("Órdenes", "Orders")} value={String(hvCell.summary.orders)} />
                      {original && !isBaseCell(hvCell) && (
                        <TipRow label={t("Frente a la original", "Against the original")} value={f.pts(hvCell.summary.returnPct - original.returnPct)} valueColour={signVar(hvCell.summary.returnPct - original.returnPct)} />
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {hvCell.error === "conflict"
                        ? t("No se ejecutó: con estos valores las reglas se contradicen.", "Not run: with these values the rules contradict each other.")
                        : hvCell.error === "invalid"
                          ? t("No se ejecutó: con estos valores una condición deja de ser válida.", "Not run: with these values a condition is no longer valid.")
                          : t("Sin velas suficientes.", "Not enough candles.")}
                    </p>
                  )}
                </ChartTip>
              )}
              </div>
              <LegendRow
                items={[
                  { label: t("Gana (más intenso = más)", "Wins (stronger = more)"), colour: "var(--up)", dot: true },
                  { label: t("Pierde", "Loses"), colour: "var(--down)", dot: true },
                  { label: t("Tu estrategia", "Your strategy"), colour: "var(--primary)", dot: true },
                ]}
              />
              <p className="text-center text-[11px] text-muted-foreground">{t("Pasa el ratón por una celda para ver sus cifras; púlsala para ver su curva completa más abajo.", "Hover over a cell to see its figures; click it to see its full curve further down.")}</p>
            </div>

            <aside className="flex flex-col gap-3 border-t p-3 sm:p-4 lg:border-t-0 lg:border-l">
              <h3 className="font-bold">{t("Hasta ahora", "So far")}</h3>
              <div className="flex items-center gap-3">
                <Ring value={withSummary.length ? winning / withSummary.length : 0} tone={withSummary.length === 0 ? "mixed" : winning / withSummary.length >= 0.7 ? "good" : winning / withSummary.length >= 0.5 ? "mixed" : "bad"} label={t("Variantes rentables", "Profitable variants")}>
                  <span className="text-title">{withSummary.length ? `${Math.round((winning / withSummary.length) * 100)}%` : "—"}</span>
                  <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">{t("rentables", "profitable")}</span>
                </Ring>
                <p className="num text-caption text-muted-foreground">{t(`${shown.length} de ${result.cells.length} variantes probadas.`, `${shown.length} of ${result.cells.length} variants tried.`)}</p>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t("Cómo se reparten los resultados", "How the results spread")}</p>
                <svg viewBox="0 0 250 92" className="w-full" role="img" aria-label={t("Histograma de rentabilidades", "Histogram of returns")}>
                  {counts.map((count, k) => {
                    const lo = k === 0 ? domLo : edges[k - 1]
                    const hi = k === counts.length - 1 ? domHi : edges[k]
                    const mid = (lo + hi) / 2
                    const bw = 250 / BINS
                    const bh = (count / maxCount) * 66
                    return <rect key={k} x={k * bw + 2} y={74 - bh} width={bw - 4} height={Math.max(count ? 3 : 0, bh)} rx={3} fill={signVar(mid)} opacity={0.85} />
                  })}
                  <line x1={0} x2={250} y1={75} y2={75} stroke="var(--border-strong)" />
                  {domLo < 0 && domHi > 0 && <line x1={((0 - domLo) / (domHi - domLo)) * 250} x2={((0 - domLo) / (domHi - domLo)) * 250} y1={6} y2={80} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
                  <text x={0} y={90} fontSize={9.5} fill="var(--muted-foreground)" className="num">
                    {f.pct(domLo, 0)}
                  </text>
                  <text x={250} y={90} fontSize={9.5} fill="var(--muted-foreground)" textAnchor="end" className="num">
                    {f.pct(domHi, 0)}
                  </text>
                </svg>
              </div>

              <dl className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <StatTile label={t("Mejor", "Best")} value={best?.summary ? f.signedPct(best.summary.returnPct) : "—"} sub={best ? valuesText(best) : undefined} tone={best?.summary ? (best.summary.returnPct > 0 ? "good" : "bad") : undefined} />
                <StatTile label={t("Peor", "Worst")} value={worst?.summary ? f.signedPct(worst.summary.returnPct) : "—"} sub={worst ? valuesText(worst) : undefined} tone={worst?.summary ? (worst.summary.returnPct >= 0 ? "good" : "bad") : undefined} />
              </dl>
              {finished && <p className="text-[11px] text-muted-foreground">{t("Pulsa R para repetir.", "Press R to replay.")}</p>}
            </aside>
          </div>
        )
      }}
      results={
        <>
          <RobustVerdict report={report} strategyName={run.strategy.name} format={format} notes={notes} />
          <ReadingPanel label={t("Lectura de los resultados", "Reading the results")} title={t("Lectura de los resultados", "Reading the results")} lines={reading} terms={terms} />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label={t("Estrategia original", "Original strategy")} value={report.baseReturnPct === null ? "—" : f.signedPct(report.baseReturnPct)} tone={report.baseReturnPct === null ? undefined : report.baseReturnPct > 0 ? "good" : "bad"} hint={t("Rentabilidad de tu estrategia con los valores que guardaste. Es la referencia con la que se comparan todas las variantes.", "Return of your strategy with the values you saved. It is the reference all variants are compared with.")} />
            <StatTile
              hint={t("Rentabilidad media de las variantes inmediatamente contiguas a la tuya (un paso arriba o abajo en cada parámetro). Si se parece a la tuya, pequeños cambios no alteran el resultado.", "Average return of the variants right next to yours (one step up or down on each parameter). If it is close to yours, small changes don't alter the result.")}
              label={t("Media de las vecinas", "Average of the neighbours")}
              value={report.neighborReturnPct === null ? "—" : f.signedPct(report.neighborReturnPct)}
              sub={report.retention === null ? undefined : t(`${Math.round(report.retention * 100)} % de la original`, `${Math.round(report.retention * 100)} % of the original`)}
              tone={report.neighborReturnPct === null ? undefined : report.neighborReturnPct > 0 ? "good" : "bad"}
            />
            <StatTile label={t("Mejor variante", "Best variant")} value={report.maxReturnPct === null ? "—" : f.signedPct(report.maxReturnPct)} />
            <StatTile label={t("Peor variante", "Worst variant")} value={report.minReturnPct === null ? "—" : f.signedPct(report.minReturnPct)} tone={report.minReturnPct !== null && report.minReturnPct >= 0 ? "good" : "bad"} />
            <StatTile label={t("Mediana de las variantes", "Median of the variants")} value={stats ? f.signedPct(stats.median) : "—"} sub={t("el caso típico", "the typical case")} tone={stats ? (stats.median > 0 ? "good" : "bad") : undefined} hint={t("Valor central: la mitad de las variantes obtuvo más y la otra mitad menos. Es menos sensible que la media a una variante excepcional.", "The middle value: half of the variants made more and half made less. It is less sensitive than the average to one exceptional variant.")} />
            <StatTile label={t("Dispersión", "Spread")} value={stats?.stdev == null ? "—" : `±${f.decimal1.format(stats.stdev)} pts`} sub={t("cuanto menor, más estable", "the smaller, the steadier")} hint={t("Desviación típica de las rentabilidades, en puntos porcentuales: cuánto se alejan, de media, las variantes de su promedio. Una cifra baja indica resultados homogéneos.", "Standard deviation of the returns, in percentage points: how far the variants are from their average, on average. A low figure means consistent results.")} />
            <StatTile label={t("Recorrido", "Range")} value={stats ? `${f.decimal1.format(stats.spread)} pts` : "—"} sub={t("de la peor a la mejor", "from worst to best")} hint={t("Diferencia en puntos entre la mejor y la peor variante.", "Difference in points between the best and the worst variant.")} />
            <StatTile label={t("Variantes ejecutadas", "Variants run")} value={`${report.ran} / ${report.total}`} meter={report.total ? report.ran / report.total : 0} />
          </dl>

          <div className="grid gap-4 xl:grid-cols-2">
            {profiles.map((profile) => (
              <ProfileChart key={profile.axis} profile={profile} name={names[profile.axis]} count={result.axes.length} />
            ))}
            <RiskReturn result={result} names={names} selected={detailIndex} onSelect={setSelected} />
            <Podium result={result} best={ranked.best} worst={ranked.worst} selected={detailIndex} onSelect={setSelected} />
          </div>

          {detail && (
            <section aria-label={t("Detalle de la variante", "Variant detail")} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <h3 className="font-bold">
                {names.map((n, k) => `${n}: ${num.format(detail.values[k])}`).join(" · ")}
                {isBaseCell(detail) && <span className="ml-2 text-primary">({t("original", "original")})</span>}
              </h3>
              {detail.summary ? (
                <>
                  <CurveDetail summary={detail.summary} from={run.from} to={run.to} />
                  <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatTile label={t("Estrategia", "Strategy")} value={f.signedPct(detail.summary.returnPct)} tone={detail.summary.returnPct > 0 ? "good" : "bad"} />
                    <StatTile label={t("Mantener", "Hold")} value={f.signedPct(detail.summary.benchmarkReturnPct)} />
                    <StatTile label={t("Caída máx.", "Max drawdown")} value={`−${f.pct(detail.summary.maxDrawdownPct)}`} />
                    <StatTile label={t("Acierto", "Win rate")} value={detail.summary.roundTrips ? f.pct(detail.summary.winRatePct, 0) : "—"} sub={t(`${detail.summary.roundTrips} operaciones`, `${detail.summary.roundTrips} trades`)} hint={t("Porcentaje de operaciones cerradas con beneficio. Por sí solo no indica rentabilidad: depende también de cuánto se gana y se pierde en cada una.", "Share of closed trades with a profit. On its own it doesn't show profitability: it also depends on how much each one wins and loses.")} />
                    <StatTile label="Sharpe" value={f.ratio.format(detail.summary.sharpe)} hint={t("Rentabilidad obtenida por cada unidad de variabilidad (riesgo). Por encima de 1 se considera buena; por debajo de 0, la estrategia pierde.", "Return earned per unit of variability (risk). Above 1 is considered good; below 0, the strategy loses.")} />
                    <StatTile label={t("Factor de beneficio", "Profit factor")} value={detail.summary.profitFactor === null ? "—" : f.ratio.format(detail.summary.profitFactor)} hint={t("Suma de las ganancias dividida entre la suma de las pérdidas. Por encima de 1 la estrategia gana más de lo que pierde.", "Sum of the gains divided by the sum of the losses. Above 1 the strategy makes more than it loses.")} />
                  </dl>
                </>
              ) : (
                <p className="text-caption text-muted-foreground">
                  {detail.error === "conflict"
                    ? t("Con estos valores las reglas de compra y venta se contradicen, así que no se ejecutó.", "With these values the buy and sell rules contradict each other, so it wasn't run.")
                    : t("Con estos valores una condición deja de ser válida (por ejemplo, la media rápida igual o mayor que la lenta).", "With these values a condition is no longer valid (for example, the fast average equal to or longer than the slow one).")}
                </p>
              )}
            </section>
          )}

          <VariantsTable result={result} names={names} selected={detailIndex} onSelect={setSelected} />
        </>
      }
    />
  )
}

/** Equity of one variant against buy and hold, with its orders; hovering reads any moment of it. */
function CurveDetail({ summary, from, to }: { summary: RunSummary; from: string; to: string }) {
  const { t, f } = useReplayText()
  const id = useSvgId()
  const W = 900
  const H = 200
  const L = 46
  const R = 14
  const T = 12
  const B = 22
  const hover = useChartHover(W, H)
  const [lo, hi] = pad(extent([100, ...summary.curve, ...summary.benchmarkCurve]), 0.08)
  const y = linear(lo, hi, H - B, T)
  const x = (at: number) => L + at * (W - L - R)
  const n = summary.curve.length
  const pts = summary.curve.map((v, k) => ({ x: x(k / Math.max(1, n - 1)), y: y(v) }))
  const hold = summary.benchmarkCurve.map((v, k) => ({ x: x(k / Math.max(1, summary.benchmarkCurve.length - 1)), y: y(v) }))
  const colour = signVar(summary.returnPct)
  const fromMs = Date.parse(from)
  const span = Date.parse(to) + 86_400_000 - fromMs
  const k = hover.at ? indexAtX(hover.at.x, L, W - R, n) : null
  const u = k === null ? 0 : k / Math.max(1, n - 1)
  const holdAt = k === null ? null : curveY(summary.benchmarkCurve, u)
  const ddAt = k === null ? null : curveY(summary.drawdownCurve, u)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" role="img" aria-label={t("Capital de la variante", "Equity of the variant")} {...hover.bind}>
        <VizDefs id={id} />
        {niceTicks(lo, hi, 4).map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke={tick === 100 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 100 ? undefined : "2 5"} />
            <text x={L - 6} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
              {f.signedPct(tick - 100, 0)}
            </text>
          </g>
        ))}
        <path d={areaPath(pts, y(100))} fill={paint(id, summary.returnPct >= 0 ? "up" : "down")} />
        <path d={linePath(hold)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <path d={linePath(pts)} fill="none" stroke={colour} strokeWidth={2.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {summary.marks.map((m, i) => (
          <path key={i} d={trianglePath(x(m.at), y(curveY(summary.curve, m.at)) + (m.side === "buy" ? 10 : -10), 3.4, m.side === "buy")} fill={m.side === "buy" ? "var(--up)" : "var(--down)"} stroke="var(--card)" strokeWidth={1} opacity={0.9} />
        ))}
        {k !== null && holdAt !== null && (
          <>
            <Crosshair x={pts[k].x} top={T} bottom={H - B} />
            <HoverDot x={x(u)} y={y(holdAt)} colour="var(--muted-foreground)" r={3.5} />
            <HoverDot x={pts[k].x} y={pts[k].y} colour={colour} />
          </>
        )}
      </svg>
      {k !== null && holdAt !== null && (
        <ChartTip x={pts[k].x} y={pts[k].y} width={W} height={H}>
          <TipTitle>{f.date.format(new Date(fromMs + u * span))}</TipTitle>
          <TipRow label={t("Estrategia", "Strategy")} value={f.signedPct(summary.curve[k] - 100)} colour={colour} valueColour={signVar(summary.curve[k] - 100)} strong />
          <TipRow label={t("Comprar y mantener", "Buy and hold")} value={f.signedPct(holdAt - 100)} colour="var(--muted-foreground)" dashed />
          <TipRow label={t("Caída desde el máximo", "Drop from the peak")} value={ddAt ? `−${f.pct(ddAt)}` : "0 %"} />
        </ChartTip>
      )}
    </div>
  )
}

const curveY = (curve: number[], at: number) => {
  const k = clamp(at) * (curve.length - 1)
  const i = Math.min(curve.length - 2, Math.floor(k))
  return curve.length < 2 ? (curve[0] ?? 100) : curve[i] + (curve[i + 1] - curve[i]) * (k - i)
}

/** Return along one parameter: averaged over the other one, with the best and worst around it. */
function ProfileChart({ profile, name, count }: { profile: ReturnType<typeof axisProfiles>[number]; name: string; count: number }) {
  const { locale, t, f } = useReplayText()
  const id = useSvgId()
  const num = numberFormat(locale, { maximumFractionDigits: 2 })
  const W = 520
  const H = 220
  const L = 52
  const R = 18
  const T = 16
  const B = 44
  const [hover, setHover] = useState<number | null>(null)
  const known = profile.points.flatMap((p) => (p.mean === null ? [] : [p.mean, p.min ?? p.mean, p.max ?? p.mean]))
  const [lo, hi] = pad(extent(known.length ? [...known, 0] : [0, 1]), 0.1)
  const y = linear(lo, hi, H - B, T)
  const x = (k: number) => L + (k / Math.max(1, profile.points.length - 1)) * (W - L - R)
  const slot = (W - L - R) / Math.max(1, profile.points.length - 1)
  const mean = profile.points.flatMap((p, k) => (p.mean === null ? [] : [{ x: x(k), y: y(p.mean) }]))
  const top = profile.points.flatMap((p, k) => (p.max === null ? [] : [{ x: x(k), y: y(p.max) }]))
  const bottom = profile.points.flatMap((p, k) => (p.min === null ? [] : [{ x: x(k), y: y(p.min) }]))
  const hp = hover === null ? null : profile.points[hover]
  const levelName = (level: number) => (level === 0 ? t("valor original", "original value") : `${level > 0 ? "+" : "−"}${Math.round(Math.abs(level) * 100)} %`)
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4" aria-label={`${t("Perfil de", "Profile of")} ${name}`}>
      <header>
        <h3 className="flex items-center gap-1.5 font-bold">
          {t("Rentabilidad según", "Return by")} {name}
          <Hint title={t("Cómo leer este gráfico", "How to read this chart")}>
            {t(
              `Cada punto es la rentabilidad media de todas las variantes que usan ese valor${count === 2 ? ", promediando el otro parámetro" : ""}. La franja sombreada va de la peor a la mejor de ellas. Una línea alta y plana indica que el resultado no depende de este parámetro; una subida aislada en el valor original sugiere sobreajuste.`,
              `Each dot is the average return of every variant using that value${count === 2 ? ", averaging over the other parameter" : ""}. The shaded band goes from the worst to the best of them. A high, flat line means the result doesn't depend on this parameter; an isolated rise at the original value suggests overfitting.`
            )}
          </Hint>
        </h3>
        <p className="text-[11px] text-muted-foreground">{t("Una línea plana y alta es una meseta (robusta); un pico estrecho, sobreajuste.", "A flat, high line is a plateau (robust); a narrow peak, overfitting.")}</p>
      </header>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onPointerLeave={() => setHover(null)}>
          <VizDefs id={id} />
          {niceTicks(lo, hi, 4).map((tick) => (
            <g key={tick}>
              <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 0 ? undefined : "2 5"} />
              <text x={L - 6} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
                {f.pct(tick + 0, 0)}
              </text>
            </g>
          ))}
          {hover !== null && <rect x={x(hover) - slot / 2} y={T - 6} width={slot} height={H - B - T + 12} rx={8} fill="var(--primary)" opacity={0.07} />}
          {top.length > 1 && <path d={`${linePath(top)}${[...bottom].reverse().map((q) => `L${q.x} ${q.y}`).join("")}Z`} fill="var(--primary)" opacity={0.13} />}
          <line x1={x(2)} x2={x(2)} y1={T} y2={H - B} stroke="var(--primary)" strokeDasharray="4 4" opacity={0.6} />
          {mean.length > 1 && <path d={linePath(mean)} fill="none" stroke="var(--primary)" strokeWidth={2.6} strokeLinejoin="round" filter={glow(id)} />}
          {profile.points.map((p, k) =>
            p.mean === null ? null : (
              <g key={k}>
                {hover === k && p.min !== null && p.max !== null && <line x1={x(k)} x2={x(k)} y1={y(p.max)} y2={y(p.min)} stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" opacity={0.45} />}
                <circle cx={x(k)} cy={y(p.mean)} r={hover === k ? 7 : k === 2 ? 6 : 4.5} fill={signVar(p.mean)} stroke="var(--card)" strokeWidth={2} />
                <text x={x(k)} y={y(p.mean) - 11} textAnchor="middle" fontSize={10} fontWeight={700} fill={signVar(p.mean)} className="num">
                  {f.signedPct(p.mean, 0)}
                </text>
              </g>
            )
          )}
          {profile.points.map((p, k) => (
            <g key={`l${k}`}>
              <text x={x(k)} y={H - 24} textAnchor="middle" fontSize={11} fontWeight={k === 2 || hover === k ? 800 : 600} fill={k === 2 ? "var(--primary)" : "var(--foreground)"} className="num">
                {num.format(p.value)}
              </text>
              <text x={x(k)} y={H - 10} textAnchor="middle" fontSize={9.5} fill="var(--muted-foreground)">
                {p.level === 0 ? t("original", "original") : `${p.level > 0 ? "+" : "−"}${Math.round(Math.abs(p.level) * 100)} %`}
              </text>
            </g>
          ))}
          {profile.points.map((_, k) => (
            <rect key={`h${k}`} x={x(k) - slot / 2} y={0} width={slot} height={H} fill="transparent" onPointerEnter={() => setHover(k)} onPointerDown={() => setHover(k)} />
          ))}
        </svg>
        {hp && hover !== null && hp.mean !== null && (
          <ChartTip x={x(hover)} y={y(hp.mean)} width={W} height={H}>
            <TipTitle>
              {name}: {num.format(hp.value)} <span className="font-normal text-muted-foreground">({levelName(hp.level)})</span>
            </TipTitle>
            <TipRow label={t("Media de las variantes", "Average of the variants")} value={f.signedPct(hp.mean)} valueColour={signVar(hp.mean)} strong />
            {hp.max !== null && <TipRow label={t("Mejor", "Best")} value={f.signedPct(hp.max)} />}
            {hp.min !== null && <TipRow label={t("Peor", "Worst")} value={f.signedPct(hp.min)} />}
          </ChartTip>
        )}
      </div>
      <LegendRow
        items={[
          { label: t("Media de las variantes en ese valor", "Average of the variants at that value"), colour: "var(--primary)" },
          { label: t("De la peor a la mejor en ese valor", "From worst to best at that value"), colour: "color-mix(in oklab, var(--primary) 30%, transparent)", dot: true },
        ]}
      />
    </section>
  )
}

/** Each variant as a dot: how much it made against how far it fell. */
function RiskReturn({ result, names, selected, onSelect }: { result: SensitivityBatchResult; names: string[]; selected: number; onSelect: (i: number) => void }) {
  const { locale, t, f } = useReplayText()
  const num = numberFormat(locale, { maximumFractionDigits: 2 })
  const [hover, setHover] = useState<number | null>(null)
  const W = 520
  const H = 260
  const L = 52
  const R = 18
  const T = 14
  const B = 40
  const ran = result.cells.flatMap((c, i) => (c.summary ? [{ c, i, s: c.summary }] : []))
  const [xLo, xHi] = [0, Math.max(5, ...ran.map((r) => r.s.maxDrawdownPct)) * 1.1]
  const [yLo, yHi] = pad(extent(ran.length ? [...ran.map((r) => r.s.returnPct), 0] : [0, 1]), 0.12)
  const x = linear(xLo, xHi, L, W - R)
  const y = linear(yLo, yHi, H - B, T)
  const hv = ran.find((r) => r.i === hover)
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4" aria-label={t("Rentabilidad frente a caída", "Return against drawdown")}>
      <header>
        <h3 className="flex items-center gap-1.5 font-bold">
          {t("Ganancia frente a caída", "Gain against drop")}
          <Hint title={t("Cómo leer este gráfico", "How to read this chart")}>
            {t(
              "Cada punto es una variante. En vertical, lo que ganó o perdió; en horizontal, la mayor caída del capital desde un máximo. Las mejores están arriba a la izquierda: ganan más con menos riesgo. Si tu estrategia (con aro) queda aislada del grupo, sus valores pueden estar sobreajustados.",
              "Each dot is a variant. Vertically, what it made or lost; horizontally, the largest fall of the capital from a peak. The best are at the top left: they make more with less risk. If your strategy (ringed) sits apart from the group, its values may be overfitted."
            )}
          </Hint>
        </h3>
        <p className="text-[11px] text-muted-foreground">{t("Arriba y a la izquierda es lo mejor: gana mucho y cae poco.", "Top left is best: it makes a lot and falls little.")}</p>
      </header>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onPointerLeave={() => setHover(null)}>
          {niceTicks(yLo, yHi, 5).map((tick) => (
            <g key={tick}>
              <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--border-strong)" : "var(--border)"} strokeDasharray={tick === 0 ? undefined : "2 5"} />
              <text x={L - 6} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="num">
                {f.pct(tick + 0, 0)}
              </text>
            </g>
          ))}
          {niceTicks(xLo, xHi, 5).map((tick) => (
            <text key={tick} x={x(tick)} y={H - 22} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)" className="num">
              {f.pct(tick + 0, 0)}
            </text>
          ))}
          <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--muted-foreground)">
            {t("Caída máxima →", "Max drawdown →")}
          </text>
          {hv && (
            <g pointerEvents="none" opacity={0.5}>
              <line x1={L} x2={x(hv.s.maxDrawdownPct)} y1={y(hv.s.returnPct)} y2={y(hv.s.returnPct)} stroke="var(--foreground)" strokeDasharray="3 3" />
              <line x1={x(hv.s.maxDrawdownPct)} x2={x(hv.s.maxDrawdownPct)} y1={y(hv.s.returnPct)} y2={H - B} stroke="var(--foreground)" strokeDasharray="3 3" />
            </g>
          )}
          {ran.map(({ c, i, s }) => {
            const base = isBaseCell(c)
            const active = selected === i || hover === i
            return (
              <g
                key={i}
                className="cursor-pointer outline-none"
                tabIndex={0}
                role="button"
                aria-label={`${c.values.map((v) => num.format(v)).join(" · ")}: ${f.signedPct(s.returnPct)}`}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(i))}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                {base && <circle cx={x(s.maxDrawdownPct)} cy={y(s.returnPct)} r={11} fill="none" stroke="var(--primary)" strokeWidth={2} />}
                <circle cx={x(s.maxDrawdownPct)} cy={y(s.returnPct)} r={active ? 7.5 : 5.5} fill={signVar(s.returnPct)} opacity={hover === null || hover === i ? 0.9 : 0.45} stroke={active ? "var(--foreground)" : "var(--card)"} strokeWidth={active ? 2 : 1.5} />
                <circle cx={x(s.maxDrawdownPct)} cy={y(s.returnPct)} r={14} fill="transparent" />
              </g>
            )
          })}
        </svg>
        {hv && (
          <ChartTip x={x(hv.s.maxDrawdownPct)} y={y(hv.s.returnPct)} width={W} height={H}>
            {names.map((n, k) => (
              <TipTitle key={k}>
                {n}: {num.format(hv.c.values[k])}
              </TipTitle>
            ))}
            {isBaseCell(hv.c) && <p className="text-[10px] font-semibold text-primary uppercase">{t("Tu estrategia", "Your strategy")}</p>}
            <TipRow label={t("Rentabilidad", "Return")} value={f.signedPct(hv.s.returnPct)} valueColour={signVar(hv.s.returnPct)} strong />
            <TipRow label={t("Caída máxima", "Max drawdown")} value={`−${f.pct(hv.s.maxDrawdownPct)}`} />
            <TipRow label="Sharpe" value={f.ratio.format(hv.s.sharpe)} />
            <TipRow label={t("Órdenes", "Orders")} value={String(hv.s.orders)} />
          </ChartTip>
        )}
      </div>
      <LegendRow
        items={[
          { label: t("Variante", "Variant"), colour: "var(--muted-foreground)", dot: true },
          { label: t("Tu estrategia (con aro)", "Your strategy (ringed)"), colour: "var(--primary)", dot: true },
        ]}
      />
    </section>
  )
}

/** The three best and three worst variants, each one a button to see its detail. */
function Podium({ result, best, worst, selected, onSelect }: { result: SensitivityBatchResult; best: number[]; worst: number[]; selected: number; onSelect: (i: number) => void }) {
  const { t, f } = useReplayText()
  const num = numberFormat(useReplayText().locale, { maximumFractionDigits: 2 })
  const group = (title: string, list: number[]) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {list.map((i) => {
          const cell = result.cells[i]
          const s = cell.summary
          if (!s) return null
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={selected === i}
                className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30", selected === i && "border-primary bg-accent/50")}
              >
                <Spark curve={s.curve} hold={s.benchmarkCurve} width={64} height={24} />
                <span className="num min-w-0 flex-1 truncate text-caption">
                  {cell.values.map((v) => num.format(v)).join(" · ")}
                  {isBaseCell(cell) && <span className="ml-1 text-primary">({t("original", "original")})</span>}
                </span>
                <span className="num font-bold" style={{ color: signVar(s.returnPct) }}>
                  {f.signedPct(s.returnPct)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4" aria-label={t("Mejores y peores variantes", "Best and worst variants")}>
      <h3 className="font-bold">{t("Las mejores y las peores", "The best and the worst")}</h3>
      {group(t("Mejores", "Best"), best)}
      {group(t("Peores", "Worst"), worst)}
    </section>
  )
}

/** Every variant with its figures; a row selects it. */
function VariantsTable({ result, names, selected, onSelect }: { result: SensitivityBatchResult; names: string[]; selected: number; onSelect: (i: number) => void }) {
  const { t, f } = useReplayText()
  const num = numberFormat(useReplayText().locale, { maximumFractionDigits: 2 })
  const toneOf = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "")
  const rows = useMemo(() => result.cells.map((cell, i) => ({ cell, i })).sort((a, b) => (b.cell.summary?.returnPct ?? -Infinity) - (a.cell.summary?.returnPct ?? -Infinity)), [result.cells])
  return (
    <section aria-label={t("Todas las variantes", "All variants")} className="overflow-hidden rounded-xl border bg-card">
      <div className="max-h-[26rem] overflow-auto">
        <table className="w-full min-w-[46rem] text-left text-caption">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              {names.map((n) => (
                <th key={n} className="px-3 py-2 font-semibold">
                  {n}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold">{t("Estrategia", "Strategy")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Mantener", "Hold")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Caída máx.", "Max drawdown")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Acierto", "Win rate")}</th>
              <th className="px-3 py-2 text-right font-semibold">Sharpe</th>
              <th className="px-3 py-2 text-right font-semibold">{t("Órdenes", "Orders")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cell, i }) => {
              const s = cell.summary
              return (
                <tr key={i} onClick={() => s && onSelect(i)} className={cn("border-t", s && "cursor-pointer hover:bg-muted/50", selected === i && "bg-accent/40")}>
                  {cell.values.map((v, k) => (
                    <td key={k} className="num px-3 py-2">
                      {num.format(v)}
                      {k === 0 && isBaseCell(cell) && <span className="ml-2 text-[10px] font-semibold text-primary uppercase">{t("original", "original")}</span>}
                    </td>
                  ))}
                  {s ? (
                    <>
                      <td className={cn("num px-3 py-2 text-right font-semibold", toneOf(s.returnPct))}>{f.signedPct(s.returnPct)}</td>
                      <td className={cn("num px-3 py-2 text-right", toneOf(s.benchmarkReturnPct))}>{f.signedPct(s.benchmarkReturnPct)}</td>
                      <td className="num px-3 py-2 text-right">−{f.pct(s.maxDrawdownPct)}</td>
                      <td className="num px-3 py-2 text-right">{s.roundTrips ? f.pct(s.winRatePct, 0) : "—"}</td>
                      <td className="num px-3 py-2 text-right">{f.ratio.format(s.sharpe)}</td>
                      <td className="num px-3 py-2 text-right">{s.orders}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="px-3 py-2 text-right text-muted-foreground">
                      {cell.error === "conflict" ? t("Reglas contradictorias", "Contradictory rules") : cell.error === "invalid" ? t("Condición inválida", "Invalid condition") : t("Sin velas", "No candles")}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
