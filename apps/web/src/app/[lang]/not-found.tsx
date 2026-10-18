import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("Página no encontrada", "Page not found"), robots: { index: false, follow: true } };
}

/** 404 of any page (unknown asset, strategy or URL), inside the site's layout and in its language. */
export default async function NotFound() {
  const { t, href } = await getI18n();
  return (
    <div className="container-page flex flex-col items-center gap-4 py-16 text-center lg:py-24">
      <p className="num text-caption font-semibold text-muted-foreground">404</p>
      <h1>{t("Página no encontrada", "Page not found")}</h1>
      <p className="max-w-md text-muted-foreground">
        {t(
          "La página que buscas no existe o ha cambiado de dirección. Elige un activo para hacer un backtest o revisa las estrategias.",
          "The page you're looking for doesn't exist or has moved. Pick an asset to run a backtest or browse the strategies."
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={href("/")} className={buttonVariants()}>
          {t("Ver activos", "View assets")}
        </Link>
        <Link href={href("/strategies")} className={buttonVariants({ variant: "outline" })}>
          {t("Estrategias", "Strategies")}
        </Link>
      </div>
    </div>
  );
}
