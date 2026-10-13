import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PresetDetail } from "@/components/strategy/preset-detail";
import { isPreset } from "@/lib/preset-strategies";

export const metadata: Metadata = { title: "Estrategia predefinida" };

/** Read-only page of a built-in strategy; the user's own strategies go to the editor. */
export default async function StrategyPage({ params }: PageProps<"/strategies/[id]">) {
  const { id } = await params;
  if (!isPreset(id)) redirect(`/strategies/${id}/edit`);
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <PresetDetail id={id} />
    </div>
  );
}
