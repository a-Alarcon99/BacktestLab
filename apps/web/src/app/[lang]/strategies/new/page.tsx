import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { StrategyForm } from "@/components/strategy/strategy-form";
import { getI18n } from "@/lib/i18n-server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  return pageMetadata({ locale, path: "/strategies/new", title: t("Nueva estrategia", "New strategy"), noindex: true });
}

export default async function NewStrategyPage() {
  const { t, href } = await getI18n();
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:gap-8 lg:py-8">
      <div className="flex flex-col gap-3">
        <nav aria-label={t("Ruta", "Breadcrumb")} className="flex items-center gap-1 text-caption text-muted-foreground">
          <Link href={href("/strategies")} className="hover:text-foreground">
            {t("Estrategias", "Strategies")}
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="font-semibold text-foreground">{t("Nueva estrategia", "New strategy")}</span>
        </nav>
        <div className="flex flex-col gap-2">
          <h1>{t("Nueva estrategia", "New strategy")}</h1>
          <p className="max-w-2xl text-muted-foreground">
            {t(
              "Ponle un nombre y define cuándo comprar y cuándo vender. Puedes combinar varias reglas para aumentar su complejidad.",
              "Give it a name and define when to buy and when to sell. You can combine several rules to make it more complex."
            )}
          </p>
        </div>
      </div>

      <StrategyForm />
    </div>
  );
}
