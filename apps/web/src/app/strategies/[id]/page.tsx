import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PresetDetail } from "@/components/strategy/preset-detail";
import { isPreset } from "@/lib/preset-strategies";

export const metadata: Metadata = { title: "Estrategia predefinida" };

/** `params` is URL data: it is resolved inside <Suspense> so the shell can be served instantly. */
export default function StrategyPage({ params }: PageProps<"/strategies/[id]">) {
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-lg bg-muted/40" />}>
        <StrategyContent params={params} />
      </Suspense>
    </div>
  );
}

/** Read-only page of a built-in strategy; the user's own strategies go to the editor. */
async function StrategyContent({ params }: Pick<PageProps<"/strategies/[id]">, "params">) {
  const { id } = await params;
  if (!isPreset(id)) redirect(`/strategies/${id}/edit`);
  return <PresetDetail id={id} />;
}
