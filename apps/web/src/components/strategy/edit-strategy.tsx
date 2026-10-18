"use client"

import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { buttonVariants } from "@/components/ui/button"
import { isPreset } from "@/lib/preset-strategies"
import { useStrategy } from "@/lib/storage/strategies"
import { PresetDetail } from "./preset-detail"
import { StrategyForm } from "./strategy-form"

/** Edit page body: looks the strategy up in this browser. */
function EditStrategy({ id }: { id: string }) {
  const { data: strategy } = useStrategy(id)
  const { t, href } = useI18n()

  if (isPreset(id)) return <PresetDetail id={id} />
  if (strategy === undefined) return <div aria-hidden className="h-96 animate-pulse rounded-lg bg-muted/40" />
  if (strategy === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-12 text-center">
        <p className="font-semibold">{t("Estrategia no encontrada", "Strategy not found")}</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          {t(
            "Puede que se haya eliminado o que se creara en otro navegador: las estrategias se guardan en el navegador donde se crean.",
            "It may have been deleted or created in another browser: strategies are saved in the browser where they're created."
          )}
        </p>
        <Link href={href("/strategies")} className={buttonVariants({ variant: "outline" })}>
          {t("Volver a estrategias", "Back to strategies")}
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <nav aria-label={t("Ruta", "Breadcrumb")} className="flex items-center gap-1 text-caption text-muted-foreground">
          <Link href={href("/strategies")} className="hover:text-foreground">
            {t("Estrategias", "Strategies")}
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="truncate font-semibold text-foreground">{strategy.name}</span>
        </nav>
        <div className="flex flex-col gap-2">
          <h1>{t("Editar estrategia", "Edit strategy")}</h1>
          <p className="max-w-2xl text-muted-foreground">
            {t(
              "Modifica el nombre, el capital y las reglas de compra y venta. Los backtests ya ejecutados conservan su resultado.",
              "Change the name, the capital and the buy and sell rules. Backtests already run keep their results."
            )}
          </p>
        </div>
      </div>

      <StrategyForm key={strategy.id} strategy={strategy} />
    </>
  )
}

export { EditStrategy }
