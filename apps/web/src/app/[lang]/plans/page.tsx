import type { Metadata } from "next"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { getI18n } from "@/lib/i18n-server"
import { pageMetadata } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n()
  // "Coming soon" page: kept out of the index until there is a real plans catalog.
  return pageMetadata({ locale, path: "/plans", title: t("Planes", "Plans"), noindex: true })
}

export default async function PlansPage() {
  const { t, href } = await getI18n()
  return (
    <div className="container-page flex flex-col items-center gap-4 py-16 text-center lg:py-24">
      <h1>{t("Planes", "Plans")}</h1>
      <p className="max-w-md text-muted-foreground">
        {t(
          "Esta funcionalidad estará disponible pronto. Mientras tanto puedes seguir usando BacktestLab con los límites de tu cuenta.",
          "This feature will be available soon. In the meantime you can keep using BacktestLab within your account's limits."
        )}
      </p>
      <Link href={href("/strategies")} className={buttonVariants({ variant: "outline" })}>
        {t("Volver a mis estrategias", "Back to my strategies")}
      </Link>
    </div>
  )
}
