import { ActivityIcon, BarChart3Icon, CalendarClockIcon, CandlestickChartIcon, TrendingUpDownIcon, type LucideIcon } from "lucide-react"
import type { Text } from "@/lib/i18n"
import type { RuleKind } from "@/lib/strategy"

/** Rule families a strategy can combine. Shared by the list and the creation form. */
const ruleKinds: Record<RuleKind, { label: Text; description: Text; Icon: LucideIcon }> = {
  indicator: {
    label: { es: "Indicador", en: "Indicator" },
    description: { es: "RSI, medias, MACD, Bollinger, Donchian", en: "RSI, moving averages, MACD, Bollinger, Donchian" },
    Icon: ActivityIcon,
  },
  price: {
    label: { es: "Precio", en: "Price" },
    description: { es: "Subida o caída porcentual del precio", en: "Percentage rise or fall of the price" },
    Icon: TrendingUpDownIcon,
  },
  volume: {
    label: { es: "Volumen", en: "Volume" },
    description: { es: "Volumen por encima o debajo de su media", en: "Volume above or below its average" },
    Icon: BarChart3Icon,
  },
  pattern: {
    label: { es: "Patrón de velas", en: "Candlestick pattern" },
    description: { es: "Martillo, envolventes, estrellas, soldados…", en: "Hammer, engulfing, stars, soldiers…" },
    Icon: CandlestickChartIcon,
  },
  periodic: {
    label: { es: "Periódica", en: "Periodic" },
    description: { es: "Cada día, semana o mes", en: "Every day, week or month" },
    Icon: CalendarClockIcon,
  },
}

export { ruleKinds }
