import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { StrategyForm } from "@/components/strategy/strategy-form";

export const metadata: Metadata = { title: "Nueva estrategia" };

export default function NewStrategyPage() {
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <div className="flex flex-col gap-3">
        <nav aria-label="Ruta" className="flex items-center gap-1 text-caption text-muted-foreground">
          <Link href="/strategies" className="hover:text-foreground">
            Estrategias
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="font-semibold text-foreground">Nueva estrategia</span>
        </nav>
        <div className="flex flex-col gap-2">
          <h1>Nueva estrategia</h1>
          <p className="max-w-2xl text-muted-foreground">
            Ponle un nombre y define cuándo comprar y cuándo vender. Puedes combinar varias reglas para aumentar su
            complejidad.
          </p>
        </div>
      </div>

      <StrategyForm />
    </div>
  );
}
