import type { Metadata } from "next";
import { Suspense } from "react";
import { EditStrategy } from "@/components/strategy/edit-strategy";

export const metadata: Metadata = { title: "Editar estrategia" };

/** `params` is URL data: it is resolved inside <Suspense> so the shell can be served instantly. */
export default function EditStrategyPage({ params }: PageProps<"/strategies/[id]/edit">) {
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-lg bg-muted/40" />}>
        <EditStrategyContent params={params} />
      </Suspense>
    </div>
  );
}

// Strategies live in the browser: the server only forwards the id.
async function EditStrategyContent({ params }: Pick<PageProps<"/strategies/[id]/edit">, "params">) {
  return <EditStrategy id={(await params).id} />;
}
