import { CalendarRangeIcon, DicesIcon, Grid3x3Icon, ShuffleIcon, TimerIcon } from "lucide-react"
import type { RobustTest } from "@/lib/robustness-report"

type T = <V>(es: V, en: V) => V

/** The robustness tests and the two kinds of Monte Carlo. */
export type MetaKind = RobustTest | "mc-trades" | "mc-paths"

/** What each robustness test is called and does (shared by the hub cards, the panels and the history). */
export function testMeta(test: MetaKind, t: T) {
  switch (test) {
    case "mc-trades":
      return {
        icon: <ShuffleIcon />,
        title: t("Monte Carlo · tus operaciones", "Monte Carlo · your trades"),
        text: t(
          "Mezcla las operaciones reales de tu backtest miles de veces: ¿cuánto dependió del orden y del azar?",
          "Mixes your backtest's real trades thousands of times: how much did it depend on order and chance?"
        ),
      }
    case "mc-paths":
      return {
        icon: <DicesIcon />,
        title: t("Monte Carlo · mercados sintéticos", "Monte Carlo · synthetic markets"),
        text: t(
          "Recompone el precio con trozos reales y repite la estrategia en cientos de mercados parecidos.",
          "Rebuilds the price from real pieces and repeats the strategy on hundreds of similar markets."
        ),
      }
    case "windows":
      return {
        icon: <CalendarRangeIcon />,
        title: t("Ventanas móviles", "Rolling windows"),
        text: t(
          "Reinicia la estrategia en tramos sucesivos del rango: ¿gana en cualquier periodo o solo en uno?",
          "Restarts the strategy on successive slices of the range: does it win in any period or just in one?"
        ),
      }
    case "sensitivity":
      return {
        icon: <Grid3x3Icon />,
        title: t("Sensibilidad de parámetros", "Parameter sensitivity"),
        text: t(
          "Varía ±20 % uno o dos parámetros: una meseta es robusta, un pico aislado es sobreajuste.",
          "Varies one or two parameters by ±20 %: a plateau is robust, an isolated peak is overfitting."
        ),
      }
    case "timeframes":
      return {
        icon: <TimerIcon />,
        title: t("Temporalidades vecinas", "Neighbouring timeframes"),
        text: t(
          "El mismo rango en la temporalidad elegida y las de al lado: ¿se sostiene o fue casualidad?",
          "The same range on the chosen timeframe and the ones next to it: does it hold up or was it luck?"
        ),
      }
  }
}

/** Short name of a parameter's field, as the strategy form shows it. */
export function fieldLabel(field: string, t: T): string {
  switch (field) {
    case "period":
      return t("periodo", "period")
    case "value":
      return t("umbral", "threshold")
    case "fast":
      return t("media rápida", "fast average")
    case "slow":
      return t("media lenta", "slow average")
    case "signal":
      return t("señal", "signal")
    case "std_dev":
      return t("desviaciones", "deviations")
    case "pct":
      return t("variación %", "change %")
    case "lookback":
      return t("velas atrás", "candles back")
    case "multiple":
      return t("múltiplo", "multiple")
    default:
      return field
  }
}

/** Short name of a condition kind for labels such as "RSI · periodo". */
export function kindLabel(kind: string, t: T): string {
  switch (kind) {
    case "rsi":
      return "RSI"
    case "ma-cross":
      return "MA"
    case "macd":
      return "MACD"
    case "bollinger":
      return "Bollinger"
    case "donchian":
      return "Donchian"
    case "price-change":
      return t("Cambio de precio", "Price change")
    case "volume":
      return t("Volumen", "Volume")
    default:
      return kind
  }
}
