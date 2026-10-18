import type { Metadata } from "next";
import { Suspense } from "react";
import { EditStrategy } from "@/components/strategy/edit-strategy";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // A user's private strategy: never indexed (and no canonical: the URL is per user).
  return { title: t("Editar estrategia", "Edit strategy"), robots: { index: false, follow: true } };
}

/** `params` is URL data: it is resolved inside <Suspense> so the shell can be served instantly. */
export default function EditStrategyPage({ params }: PageProps<"/[lang]/strategies/[id]/edit">) {
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-lg bg-muted/40" />}>
        <EditStrategyContent params={params} />
      </Suspense>
    </div>
  );
}

// Strategies live in the browser: the server only forwards the id.
async function EditStrategyContent({ params }: Pick<PageProps<"/[lang]/strategies/[id]/edit">, "params">) {
  return <EditStrategy id={(await params).id} />;
}
