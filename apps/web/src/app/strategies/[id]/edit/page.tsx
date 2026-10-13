import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRightIcon } from "lucide-react";
import { StrategyForm } from "@/components/strategy/strategy-form";
import { getStrategy, strategies } from "@/lib/strategies-mock";

export const metadata: Metadata = { title: "Editar estrategia" };

export function generateStaticParams() {
  return strategies.map((s) => ({ id: s.id }));
}

/** `params` is URL data: it is resolved inside <Suspense> so the shell can be served instantly. */
export default function EditStrategyPage({ params }: PageProps<"/strategies/[id]/edit">) {
  return (
    <Suspense fallback={<div aria-hidden className="container-page py-6 lg:py-8"><div className="h-96 animate-pulse rounded-lg bg-muted/40" /></div>}>
      <EditStrategy params={params} />
    </Suspense>
  );
}

async function EditStrategy({ params }: Pick<PageProps<"/strategies/[id]/edit">, "params">) {
  const strategy = getStrategy((await params).id);
  if (!strategy) notFound();

  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <div className="flex flex-col gap-3">
        <nav aria-label="Ruta" className="flex items-center gap-1 text-caption text-muted-foreground">
          <Link href="/strategies" className="hover:text-foreground">
            Estrategias
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="font-semibold text-foreground">{strategy.name}</span>
        </nav>
        <div className="flex flex-col gap-2">
          <h1>Editar estrategia</h1>
          <p className="max-w-2xl text-muted-foreground">
            Modifica el nombre y las reglas de compra y venta. Los backtests ya ejecutados conservan su resultado.
          </p>
        </div>
      </div>

      <StrategyForm strategy={strategy} />
    </div>
  );
}
