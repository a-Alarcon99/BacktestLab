import type { Metadata } from "next"
import Link from "next/link"
import { draftNotice } from "@/components/legal/draft-notice"
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
      draftNotice={draftNotice(t)}
      sections={[
        {
          heading: t("Titular del sitio", "Site owner"),
          body: (
            <ul>
              <li>
                <strong>{t("Titular", "Owner")}:</strong> {operator.name}
              </li>
              <li>
                <strong>NIF/CIF:</strong> {operator.taxId}
              </li>
              <li>
                <strong>{t("Domicilio", "Address")}:</strong> {operator.address}
              </li>
              <li>
                <strong>{t("Correo de contacto", "Contact email")}:</strong> {operator.email}
              </li>
              <li>
                <strong>{t("Sitio web", "Website")}:</strong> {siteConfig.url}
              </li>
            </ul>
          ),
        },
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
          heading: t("Propiedad intelectual e industrial", "Intellectual and industrial property"),
          body: (
            <p>
              {t(
                "Los contenidos, el diseño, el código y la marca BacktestLab están protegidos por la normativa de propiedad intelectual e industrial. Queda prohibida su reproducción o uso comercial sin autorización. Los nombres y logotipos de criptoactivos pertenecen a sus respectivos titulares.",
                "The content, design, code and the BacktestLab brand are protected by intellectual and industrial property law. Reproduction or commercial use without authorisation is forbidden. Crypto-asset names and logos belong to their respective owners."
              )}
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
