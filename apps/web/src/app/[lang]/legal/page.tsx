import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/components/legal/legal-page"
import { siteConfig } from "@/config/site"
import { getI18n } from "@/lib/i18n-server"
import { pageMetadata } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n()
  return pageMetadata({
    locale,
    path: "/legal",
    title: t("Aviso legal", "Legal notice"),
    description: t(
      "Datos identificativos del titular de BacktestLab conforme a la LSSI.",
      "Identification details of the owner of BacktestLab under Spanish LSSI."
    ),
  })
}

export default async function LegalNoticePage() {
  const { locale, t, href } = await getI18n()
  const { operator } = siteConfig
  return (
    <LegalPage
      locale={locale}
      title={t("Aviso legal", "Legal notice")}
      intro={t(
        "Información general exigida por el artículo 10 de la Ley 34/2002 de servicios de la sociedad de la información y de comercio electrónico (LSSI).",
        "General information required by article 10 of Spanish Law 34/2002 on information society services and electronic commerce (LSSI)."
      )}
      sections={[
        {
          heading: t("Objeto", "Purpose"),
          body: (
            <p>
              {t(
                "BacktestLab ofrece una herramienta de simulación de estrategias de trading sobre datos históricos de criptomonedas. No presta servicios de inversión ni de asesoramiento financiero.",
                "BacktestLab provides a tool to simulate trading strategies on historical cryptocurrency data. It provides no investment services or financial advice."
              )}
            </p>
          ),
        },
        {
          heading: t("Condiciones de uso y privacidad", "Terms of use and privacy"),
          body: (
            <p>
              <Link href={href("/terms")}>{t("Términos y condiciones", "Terms and conditions")}</Link> ·{" "}
              <Link href={href("/privacy")}>{t("Política de privacidad", "Privacy policy")}</Link> ·{" "}
              <Link href={href("/cookies")}>{t("Política de cookies", "Cookie policy")}</Link>
            </p>
          ),
        },
        {
          heading: t("Ley aplicable", "Governing law"),
          body: (
            <p>
              {t(
                "Este sitio se rige por la legislación española. Para cualquier controversia, y salvo que la normativa de consumidores disponga otra cosa, serán competentes los juzgados y tribunales del domicilio del titular.",
                "This site is governed by Spanish law. For any dispute, unless consumer law provides otherwise, the courts of the owner's domicile have jurisdiction."
              )}
            </p>
          ),
        },
      ]}
    />
  )
}
