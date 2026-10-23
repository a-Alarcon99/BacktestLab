"use client"

import type { CSSProperties } from "react"
import { cn } from "cn"
import type { BacktestResult } from "@/lib/backtests"
import { sign, useReplayText } from "../replay/format"
import { DOCK_TARGETS } from "../replay/live-panels"
import { InfoHint, Reveal } from "./parts"

type Metric = {
  id: string
  label: string
  value: string
  tone?: "up" | "down"
  /** One plain sentence under the value. */
  plain: string
  /** Longer explanation behind the "?" button. */
  info: string
}

const docked = new Set<string>(Object.values(DOCK_TARGETS))

/**
 * The key figures of the run, each with a plain sentence and a "what does it mean?". The cards
 * that a live tile of the replay flies to are held back until it lands (`landed`, 0 → 1).
 */
export function KeyMetrics({ result, capital, landed = 1 }: { result: BacktestResult; capital: number; landed?: number }) {
  const { t, f } = useReplayText()
  const m = result.metrics
  const s = result.stats
  const open = result.roundTrips.filter((trip) => trip.open).length
  const per10 = m.roundTrips ? Math.round(m.winRatePct / 10) : 0
  const breakEven = m.payoffRatio !== null ? 100 / (1 + m.payoffRatio) : null
  const longest = m.longestDrawdown

  const metrics: Metric[] = [
    {
      id: "return",
      label: t("Resultado", "Result"),
      value: f.signedPct(m.returnPct, 2),
      tone: sign(m.returnPct),
      plain: t(`${f.usdt(m.netProfit, true)} sobre ${f.usdt(capital)} iniciales.`, `${f.usdt(m.netProfit, true)} on ${f.usdt(capital)} to start.`),
      info: t(
        "Cuánto ganó o perdió el capital desde el inicio, ya descontadas todas las comisiones. Si al final queda una operación abierta, se valora como si se vendiera al último precio (pagando también esa comisión).",
        "How much the capital gained or lost since the start, after every fee. A trade still open at the end is valued as if sold at the last price (paying that fee too)."
      ),
    },
    {
      id: "benchmark",
      label: t("Frente a comprar y mantener", "Versus buy and hold"),
      value: f.pts(m.excessReturnPct),
      tone: sign(Math.abs(m.excessReturnPct) < 0.05 ? 0 : m.excessReturnPct),
      plain: t(
        `Comprar al inicio y no tocar nada habría dado ${f.signedPct(m.benchmarkReturnPct)}.`,
        `Buying at the start and holding would have made ${f.signedPct(m.benchmarkReturnPct)}.`
      ),
      info: t(
        "Compara tu estrategia con la alternativa más sencilla: comprar todo con el capital inicial en la primera vela y venderlo en la última (con las mismas comisiones). Si no la supera, operar no te aportó nada en este periodo.",
        "Compares your strategy with the simplest alternative: buying everything with the initial capital on the first candle and selling on the last (same fees). If it doesn't beat it, trading added nothing in this period."
      ),
    },
    {
      id: "drawdown",
      label: t("Caída máxima", "Max drawdown"),
      value: m.maxDrawdownPct > 0 ? f.signedPct(-m.maxDrawdownPct) : f.pct(0),
      tone: m.maxDrawdownPct > 0 ? "down" : undefined,
      plain: t(
        `La peor bajada desde un máximo. Comprar y mantener: ${f.signedPct(-m.benchmarkMaxDrawdownPct)}.`,
        `The worst fall from a peak. Buy and hold: ${f.signedPct(-m.benchmarkMaxDrawdownPct)}.`
      ),
      info: t(
        "Lo máximo que llegó a perder el capital desde su mejor momento hasta su peor momento posterior. Es la mejor medida del riesgo: indica cuánto tendrías que aguantar viendo caer tu dinero.",
        "The most the capital lost from its best moment to its worst moment after it. It's the best measure of risk: how much you'd have to endure watching your money fall."
      ),
    },
    {
      id: "underwater",
      label: t("Mayor tiempo en pérdidas", "Longest time under water"),
      value: longest ? f.duration(longest.seconds) : "—",
      plain: longest
        ? longest.recovered
          ? t("Lo más que tardó en volver a su máximo.", "The longest it took to get back to its peak.")
          : t("Al terminar aún no había recuperado su máximo.", "It hadn't recovered its peak by the end.")
        : t("Nunca estuvo por debajo de un máximo anterior.", "It was never below a previous peak."),
      info: t(
        "El periodo más largo en el que el capital estuvo por debajo de un máximo anterior. Mide la paciencia que exige la estrategia: cuánto tiempo seguido podrías estar sin ganar.",
        "The longest stretch the capital spent below a previous peak. It measures the patience the strategy demands: how long you might go without gains."
      ),
    },
    {
      id: "trades",
      label: t("Operaciones", "Trades"),
      value: f.count.format(m.roundTrips) + (open ? ` + ${open}` : ""),
      plain: t(
        `${f.decimal1.format(m.tradesPerMonth)} al mes${open ? " · 1 sigue abierta" : ""}.`,
        `${f.decimal1.format(m.tradesPerMonth)} a month${open ? " · 1 still open" : ""}.`
      ),
      info: t(
        "Una operación va desde que se compra (sin tener nada) hasta que se vende todo. Si una operación tiene varias compras o ventas parciales, sigue contando como una. Cuantas más operaciones, más fiable es el resultado.",
        "A trade goes from buying (holding nothing) to selling everything. Several buys or partial sells inside it still count as one. The more trades, the more reliable the result."
      ),
    },
    {
      id: "orders",
      label: t("Compras y ventas", "Buys and sells"),
      value: `${f.count.format(s.buys)} / ${f.count.format(s.sells)}`,
      plain: t(
        `${f.plural(s.buys, "compra (entrada)", "compras (entradas)")} y ${f.plural(s.sells, "venta (salida)", "ventas (salidas)")} en total.`,
        `${f.plural(s.buys, "buy (entry)", "buys (entries)")} and ${f.plural(s.sells, "sell (exit)", "sells (exits)")} in total.`
      ),
      info: t(
        "Todas las órdenes que ejecutó la estrategia. Una operación puede agrupar varias compras (entrar poco a poco) y varias ventas (salir poco a poco), por eso suele haber más órdenes que operaciones.",
        "Every order the strategy executed. One trade can group several buys (scaling in) and several sells (scaling out), so there are usually more orders than trades."
      ),
    },
    {
      id: "winrate",
      label: t("Tasa de acierto", "Win rate"),
      value: m.roundTrips ? f.pct(m.winRatePct) : "—",
      plain: m.roundTrips
        ? t(
            `${f.plural(m.wins, "ganada", "ganadas")} y ${f.plural(m.losses, "perdida", "perdidas")} (unas ${per10} de cada 10).`,
            `${f.count.format(m.wins)} won and ${f.count.format(m.losses)} lost (about ${per10} in 10).`
          )
        : t("Ninguna operación cerrada.", "No closed trades."),
      info: t(
        "El porcentaje de operaciones cerradas que terminaron ganando dinero. Ojo: un acierto alto no basta si las pérdidas son mucho más grandes que las ganancias.",
        "The share of closed trades that made money. Careful: a high win rate isn't enough if the losses are much bigger than the gains."
      ),
    },
    {
      id: "pf",
      label: t("Factor de beneficio", "Profit factor"),
      value: m.profitFactor !== null ? `×${f.ratio.format(m.profitFactor)}` : m.wins ? t("Sin pérdidas", "No losses") : "—",
      tone: m.profitFactor !== null ? (m.profitFactor >= 1 ? "up" : "down") : m.wins ? "up" : undefined,
      plain:
        m.profitFactor !== null
          ? t(`Ganó ${f.ratio.format(m.profitFactor)} USDT por cada 1 USDT perdido.`, `It made ${f.ratio.format(m.profitFactor)} USDT for every 1 USDT lost.`)
          : m.wins
            ? t("Ninguna operación cerrada perdió dinero, así que no hay cifra que calcular.", "No closed trade lost money, so there is no figure to compute.")
            : t("Sin operaciones cerradas.", "No closed trades."),
      info: t(
        "Lo ganado en las operaciones buenas dividido entre lo perdido en las malas. Por encima de 1 la estrategia gana dinero; por encima de 1,5 es sólida.",
        "What the good trades made divided by what the bad ones lost. Above 1 the strategy makes money; above 1.5 it's solid."
      ),
    },
    {
      id: "payoff",
      label: t("Ganancia media / pérdida media", "Average win / loss"),
      value: `${m.avgWinPct !== null ? f.signedPct(m.avgWinPct) : "—"} / ${m.avgLossPct !== null ? f.signedPct(m.avgLossPct) : "—"}`,
      plain:
        breakEven !== null
          ? t(`Con esto necesita acertar al menos el ${f.pct(breakEven, 0)} para no perder.`, `With this it needs to win at least ${f.pct(breakEven, 0)} to break even.`)
          : t("Hace falta al menos una ganadora y una perdedora.", "It needs at least one winner and one loser."),
      info: t(
        "Lo que gana de media una operación ganadora y lo que pierde de media una perdedora. Si las ganancias son más grandes que las pérdidas, la estrategia puede ser rentable aunque acierte menos de la mitad.",
        "What a winning trade makes on average and what a losing one loses. If gains are bigger than losses, the strategy can be profitable even winning less than half the time."
      ),
    },
    {
      id: "best",
      label: t("Mejor / peor operación", "Best / worst trade"),
      value: `${m.bestTradePct !== null ? f.signedPct(m.bestTradePct) : "—"} / ${m.worstTradePct !== null ? f.signedPct(m.worstTradePct) : "—"}`,
      plain:
        m.bestTradeSharePct !== null
          ? t(`La mejor aporta el ${f.pct(m.bestTradeSharePct, 0)} de las ganancias.`, `The best one makes ${f.pct(m.bestTradeSharePct, 0)} of the gains.`)
          : t("Sin operaciones ganadoras.", "No winning trades."),
      info: t(
        "El resultado de la operación que más ganó y de la que más perdió. Si la mejor explica casi todo el beneficio, el resultado depende de un golpe de suerte.",
        "The result of the trade that made the most and of the one that lost the most. If the best one explains almost all the profit, the result hinges on a lucky break."
      ),
    },
    {
      id: "expectancy",
      label: t("Resultado medio por operación", "Average trade"),
      value: m.expectancyPct !== null ? f.signedPct(m.expectancyPct, 2) : "—",
      tone: sign(m.expectancyPct),
      plain:
        m.expectancyUsdt !== null
          ? t(`${f.usdt(m.expectancyUsdt, true)} de media, después de comisiones.`, `${f.usdt(m.expectancyUsdt, true)} on average, after fees.`)
          : t("Sin operaciones cerradas.", "No closed trades."),
      info: t(
        "Lo que deja de media cada operación cerrada. Si es negativo, cuantas más veces se repita la estrategia, más dinero pierde.",
        "What each closed trade leaves on average. If it's negative, the more the strategy repeats, the more it loses."
      ),
    },
    {
      id: "duration",
      label: t("Duración media", "Average duration"),
      value: m.avgDurationSeconds !== null ? f.duration(m.avgDurationSeconds) : "—",
      plain:
        m.avgBars !== null
          ? t(`${f.decimal1.format(m.avgBars)} velas de media por operación.`, `${f.decimal1.format(m.avgBars)} candles per trade on average.`)
          : t("Sin operaciones cerradas.", "No closed trades."),
      info: t(
        "Cuánto tiempo pasa de media entre que se compra y se vende todo. Ayuda a saber si es una estrategia de horas, días o meses.",
        "How long it takes on average from buying to selling everything. It tells whether the strategy works in hours, days or months."
      ),
    },
    {
      id: "exposure",
      label: t("Tiempo invertido", "Time in the market"),
      value: f.pct(m.exposurePct, 0),
      plain: t("El resto del tiempo el dinero esperaba en USDT.", "The rest of the time the money waited in USDT."),
      info: t(
        "El porcentaje del periodo en el que había dinero comprado. Menos tiempo invertido significa menos exposición a las caídas, pero también a las subidas.",
        "The share of the period with money invested. Less time in the market means less exposure to falls, but also to rallies."
      ),
    },
    {
      id: "streak",
      label: t("Peor racha", "Worst streak"),
      value: t(f.plural(m.maxLossStreak, "pérdida", "pérdidas"), f.plural(m.maxLossStreak, "loss", "losses")),
      tone: m.maxLossStreak > 0 ? "down" : undefined,
      plain: t(
        `Mejor racha: ${f.plural(m.maxWinStreak, "ganada", "ganadas seguidas")}.`,
        `Best streak: ${f.plural(m.maxWinStreak, "win", "wins in a row")}.`
      ),
      info: t(
        "El mayor número de operaciones perdedoras seguidas. Sirve para saber cuántos fallos consecutivos tendrías que soportar sin abandonar la estrategia.",
        "The most losing trades in a row. It tells how many consecutive misses you'd have to sit through without giving up."
      ),
    },
    {
      id: "fees",
      label: t("Comisiones pagadas", "Fees paid"),
      value: f.usdt(m.feesPaid),
      plain: t(`Un ${f.pct((m.feesPaid / capital) * 100)} del capital inicial.`, `${f.pct((m.feesPaid / capital) * 100)} of the initial capital.`),
      info: t(
        "Lo pagado al exchange por todas las compras y ventas. Una estrategia que opera mucho puede perder su ventaja solo en comisiones.",
        "What was paid to the exchange for every buy and sell. A strategy that trades a lot can lose its edge to fees alone."
      ),
    },
  ]

  return (
    <Reveal label={t("Datos clave", "Key figures")} className="flex flex-col gap-3">
      <h3 className="text-title font-bold">{t("Datos clave", "Key figures")}</h3>
      <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric, k) => (
          <div
            key={metric.id}
            data-metric={metric.id}
            className={cn("flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3", !docked.has(metric.id) && "bt-rise")}
            style={{ "--bt-delay": `${k * 0.04}s`, ...(docked.has(metric.id) && landed < 1 ? { opacity: landed } : null) } as CSSProperties}
          >
            <dt className="flex items-center justify-between gap-1 text-caption font-semibold text-muted-foreground">
              <span className="truncate">{metric.label}</span>
              <InfoHint title={metric.label}>{metric.info}</InfoHint>
            </dt>
            <dd className={cn("num truncate text-title font-bold tracking-tight", metric.tone === "up" && "text-up", metric.tone === "down" && "text-down")}>
              {metric.value}
            </dd>
            <dd className="text-caption leading-snug text-muted-foreground">{metric.plain}</dd>
          </div>
        ))}
      </dl>
    </Reveal>
  )
}
