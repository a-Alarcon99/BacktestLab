"use client"

import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { isPreset } from "@/lib/preset-strategies"
import { useStrategy } from "@/lib/storage/strategies"
import { PresetDetail } from "./preset-detail"
import { StrategyForm } from "./strategy-form"

/** Edit page body: looks the strategy up in this browser. */
function EditStrategy({ id }: { id: string }) {
  const { data: strategy } = useStrategy(id)

  if (isPreset(id)) return <PresetDetail id={id} />
  if (strategy === undefined) return <div aria-hidden className="h-96 animate-pulse rounded-lg bg-muted/40" />
  if (strategy === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-12 text-center">
        <p className="font-semibold">Estrategia no encontrada</p>
        <p className="max-w-sm text-caption text-muted-foreground">
          Puede que se haya eliminado o que se creara en otro navegador: las estrategias se guardan en el navegador
          donde se crean.
        </p>
        <Link href="/strategies" className={buttonVariants({ variant: "outline" })}>
          Volver a estrategias
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <nav aria-label="Ruta" className="flex items-center gap-1 text-caption text-muted-foreground">
          <Link href="/strategies" className="hover:text-foreground">
            Estrategias
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="truncate font-semibold text-foreground">{strategy.name}</span>
        </nav>
        <div className="flex flex-col gap-2">
          <h1>Editar estrategia</h1>
          <p className="max-w-2xl text-muted-foreground">
            Modifica el nombre, el capital y las reglas de compra y venta. Los backtests ya ejecutados conservan su
            resultado.
          </p>
        </div>
      </div>

      <StrategyForm key={strategy.id} strategy={strategy} />
    </>
  )
}

export { EditStrategy }
