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
    path: "/privacy",
    title: t("Política de privacidad", "Privacy policy"),
    description: t(
      "Qué datos personales trata BacktestLab, para qué, con quién los comparte y cómo ejercer tus derechos.",
      "What personal data BacktestLab processes, why, who it is shared with and how to exercise your rights."
    ),
  })
}

export default async function PrivacyPage() {
  const { locale, t, href } = await getI18n()
  const { operator } = siteConfig
  const processors: [string, string][] = [
    ["Supabase", t("Base de datos (cuentas, estrategias, cuotas)", "Database (accounts, strategies, quotas)")],
    ["Vercel", t("Alojamiento de la web", "Web hosting")],
    ["Render", t("Alojamiento del motor de backtesting (API)", "Hosting of the backtesting engine (API)")],
    ["Cloudflare R2", t("Almacenamiento de datos de mercado (sin datos personales)", "Market data storage (no personal data)")],
    ["Upstash", t("Límites de uso compartidos (direcciones IP como claves)", "Shared rate limits (IP addresses as keys)")],
    ["Resend", t("Envío del correo de verificación de la cuenta", "Sending the account verification email")],
    ["Frankfurter", t("Tipo de cambio USD/EUR (no recibe datos tuyos)", "USD/EUR exchange rate (receives no data about you)")],
  ]
  return (
    <LegalPage
      locale={locale}
      title={t("Política de privacidad", "Privacy policy")}
      intro={t(
        "Esta política explica cómo trata BacktestLab tus datos personales conforme al Reglamento (UE) 2016/679 (RGPD) y la LOPDGDD.",
        "This policy explains how BacktestLab processes your personal data under Regulation (EU) 2016/679 (GDPR) and Spanish data protection law."
      )}
      sections={[
        {
          heading: t("Qué datos tratamos y para qué", "What data we process and why"),
          body: (
            <ul>
              <li>
                <strong>{t("Cuenta", "Account")}:</strong>{" "}
                {t(
                  "nombre, correo electrónico y contraseña. La contraseña se guarda cifrada con un hash (scrypt con sal propia); nunca la vemos ni la registramos. Base jurídica: ejecución del servicio que solicitas (art. 6.1.b RGPD).",
                  "name, email and password. The password is stored hashed (scrypt with a per-user salt); we never see or log it. Legal basis: performing the service you request (art. 6.1.b GDPR)."
                )}
              </li>
              <li>
                <strong>{t("Estrategias y uso", "Strategies and usage")}:</strong>{" "}
                {t(
                  "las estrategias que guardas, los contadores de backtests consumidos y el plan asignado, para aplicar los límites de uso. Base jurídica: ejecución del servicio.",
                  "the strategies you save, the counters of backtests used and your plan, to apply usage limits. Legal basis: performing the service."
                )}
              </li>
              <li>
                <strong>{t("Invitados", "Guests")}:</strong>{" "}
                {t(
                  "si no tienes cuenta, te identificamos con una cookie técnica firmada y con tu dirección IP convertida en un identificador cifrado (HMAC), para aplicar los límites de invitado y evitar abusos. La IP en bruto no se guarda en la base de datos, pero el identificador derivado se considera dato personal. Base jurídica: interés legítimo en la seguridad y el control de costes (art. 6.1.f).",
                  "if you have no account, we identify you with a signed technical cookie and your IP address turned into a keyed hash (HMAC), to apply guest limits and prevent abuse. The raw IP is not stored in the database, but the derived identifier is personal data. Legal basis: legitimate interest in security and cost control (art. 6.1.f)."
                )}
              </li>
              <li>
                <strong>{t("Seguridad", "Security")}:</strong>{" "}
                {t(
                  "direcciones IP procesadas en memoria o como claves de los límites de frecuencia, y registro de correos enviados (destinatario y fecha) para limitar el envío masivo. Base jurídica: interés legítimo.",
                  "IP addresses processed in memory or as rate-limit keys, and a log of emails sent (recipient and date) to limit mass mailing. Legal basis: legitimate interest."
                )}
              </li>
              <li>
                <strong>{t("En tu navegador", "In your browser")}:</strong>{" "}
                {t(
                  "el historial de tus últimos backtests y el borrador de estrategia se guardan solo en tu dispositivo (localStorage/sessionStorage); no los recibimos hasta que ejecutas el backtest.",
                  "your recent backtest history and the strategy draft are kept only on your device (localStorage/sessionStorage); we do not receive them until you run the backtest."
                )}
              </li>
            </ul>
          ),
        },
        {
          heading: t("Qué no hacemos", "What we do not do"),
          body: (
            <p>
              {t(
                "No usamos analítica ni publicidad, no elaboramos perfiles comerciales, no vendemos tus datos y no tomamos decisiones automatizadas con efectos jurídicos sobre ti. Los límites de uso se aplican automáticamente según tu plan, sin valoración personal.",
                "We use no analytics or advertising, build no marketing profiles, do not sell your data and make no automated decisions with legal effects on you. Usage limits are applied automatically based on your plan, without personal assessment."
              )}
            </p>
          ),
        },
        {
          heading: t("Encargados y destinatarios", "Processors and recipients"),
          body: (
            <>
              <p>
                {t(
                  "Para prestar el servicio usamos proveedores que tratan datos por nuestra cuenta, con contrato de encargado del tratamiento:",
                  "To provide the service we use providers that process data on our behalf under data processing agreements:"
                )}
              </p>
              <table>
                <tbody>
                  {processors.map(([name, role]) => (
                    <tr key={name}>
                      <td className="font-semibold text-foreground">{name}</td>
                      <td>{role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                {t(
                  "Algunos están fuera del Espacio Económico Europeo (por ejemplo, en EE. UU.). Las transferencias se amparan en decisiones de adecuación (Marco de Privacidad de Datos UE-EE. UU.) o en cláusulas contractuales tipo. También podemos comunicar datos a autoridades cuando una ley lo exija.",
                  "Some are located outside the European Economic Area (for example, in the US). Transfers rely on adequacy decisions (EU-US Data Privacy Framework) or standard contractual clauses. We may also disclose data to authorities where the law requires it."
                )}
              </p>
            </>
          ),
        },
        {
          heading: t("Conservación", "Retention"),
          body: (
            <p>
              {t(
                "Conservamos los datos de la cuenta mientras exista y los eliminamos al borrarla, salvo lo que deba guardarse bloqueado para atender responsabilidades legales. Las sesiones duran 7 días. Los contadores de uso de invitados se mantienen mientras sean necesarios para aplicar el límite.",
                "We keep account data while the account exists and delete it when you close it, except what must be kept blocked to meet legal liabilities. Sessions last 7 days. Guest usage counters are kept as long as needed to enforce the limit."
              )}
            </p>
          ),
        },
        {
          heading: t("Tus derechos", "Your rights"),
          body: (
            <p>
              {t(
                "Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a",
                "You can exercise your rights of access, rectification, erasure, objection, restriction and portability by writing to"
              )}{" "}
              {operator.email}.{" "}
              {t(
                "Responderemos en el plazo de un mes. Si consideras que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
                "We will reply within one month. If you believe we have mishandled your data, you may complain to the Spanish Data Protection Agency (aepd.es)."
              )}
            </p>
          ),
        },
        {
          heading: t("Cookies y almacenamiento local", "Cookies and local storage"),
          body: (
            <p>
              {t("Consulta la", "See the")} <Link href={href("/cookies")}>{t("política de cookies", "cookie policy")}</Link>.
            </p>
          ),
        },
        {
          heading: t("Menores", "Minors"),
          body: (
            <p>
              {t(
                "El servicio no está dirigido a menores de 18 años. Si detectamos la cuenta de un menor, la eliminaremos.",
                "The service is not aimed at people under 18. If we detect a minor's account we will delete it."
              )}
            </p>
          ),
        },
      ]}
    />
  )
}
