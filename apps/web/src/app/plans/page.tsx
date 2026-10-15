import type { Metadata } from "next"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Planes" }

export default function PlansPage() {
  return (
    <div className="container-page flex flex-col items-center gap-4 py-16 text-center lg:py-24">
      <h1>Planes</h1>
      <p className="max-w-md text-muted-foreground">
        Esta funcionalidad estará disponible pronto. Mientras tanto puedes seguir usando BacktestLab con los límites de
        tu cuenta.
      </p>
      <Link href="/strategies" className={buttonVariants({ variant: "outline" })}>
        Volver a mis estrategias
      </Link>
    </div>
  )
}
