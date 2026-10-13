import { ActivityIcon, BarChart3Icon, CalendarClockIcon, TrendingUpDownIcon, type LucideIcon } from "lucide-react"
import type { RuleKind } from "@/lib/strategies-mock"

/** Rule families a strategy can combine. Shared by the list and the creation form. */
const ruleKinds: Record<RuleKind, { label: string; description: string; Icon: LucideIcon }> = {
  indicator: { label: "Indicador", description: "Umbral de RSI, medias móviles, MACD…", Icon: ActivityIcon },
  price: { label: "Precio", description: "Subida o caída porcentual del precio", Icon: TrendingUpDownIcon },
  volume: { label: "Volumen", description: "Volumen por encima o debajo de su media", Icon: BarChart3Icon },
  periodic: { label: "Periódica", description: "Compra o venta a intervalos fijos", Icon: CalendarClockIcon },
}

export { ruleKinds }
