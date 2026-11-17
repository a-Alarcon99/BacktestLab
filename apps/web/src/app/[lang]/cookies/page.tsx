import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/components/legal/legal-page"
import { getI18n } from "@/lib/i18n-server"
import { pageMetadata } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n()
  return pageMetadata({
    locale,
    path: "/cookies",
    title: t("Política de cookies", "Cookie policy"),
    description: t(
      "Las cookies y el almacenamiento local que usa BacktestLab: solo los estrictamente necesarios, sin analítica.",
      "The cookies and local storage BacktestLab uses: strictly necessary ones only, no analytics."
    ),
  })
}

export default async function CookiesPage() {
  const { locale, t, href } = await getI18n()
  const rows: { name: string; kind: string; purpose: string; duration: string }[] = [
    {
      name: "better-auth.session_token",
      kind: "Cookie (httpOnly)",
      purpose: t("Mantiene tu sesión iniciada.", "Keeps you signed in."),
      duration: t("7 días", "7 days"),
    },
    {
      name: "bl_guest",
      kind: "Cookie (httpOnly)",
      purpose: t(
        "Identifica al invitado, firmada, para aplicar sus límites de uso.",
        "Identifies the guest, signed, to apply usage limits."
      ),
      duration: t("400 días", "400 days"),
    },
    {
      name: "bl_locale",
      kind: "Cookie",
      purpose: t("Recuerda el idioma elegido.", "Remembers the chosen language."),
      duration: t("Hasta 1 año", "Up to 1 year"),
    },
    {
      name: "bl_currency",
      kind: "Cookie",
      purpose: t("Recuerda la moneda de visualización (USD/EUR).", "Remembers the display currency (USD/EUR)."),
      duration: t("Hasta 1 año", "Up to 1 year"),
    },
    {
      name: "theme",
      kind: "localStorage",
      purpose: t("Recuerda el tema claro u oscuro.", "Remembers the light or dark theme."),
      duration: t("Hasta que lo borres", "Until you clear it"),
    },
    {
      name: "backtestlab:backtests:v1",
      kind: "localStorage",
      purpose: t(
        "Historial de tus últimos backtests, solo en tu dispositivo.",
        "History of your latest backtests, on your device only."
      ),
      duration: t("Hasta que lo borres", "Until you clear it"),
    },
    {
      name: "bl_strategy_draft2:*",
      kind: "sessionStorage",
      purpose: t(
        "Borrador de estrategia sin guardar, para no perderlo al cambiar de idioma.",
        "Unsaved strategy draft, so it survives a language switch."
      ),
      duration: t("Hasta cerrar la pestaña", "Until the tab is closed"),
    },
  ]
  return (
    <LegalPage
      locale={locale}
      title={t("Política de cookies", "Cookie policy")}
      intro={t(
        "BacktestLab solo usa cookies y almacenamiento local estrictamente necesarios para prestar el servicio o recordar tus preferencias.",
        "BacktestLab only uses cookies and local storage that are strictly necessary to provide the service or remember your preferences."
      )}
      sections={[
        {
          heading: t("Qué usamos", "What we use"),
          body: (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>{t("Nombre", "Name")}</th>
                    <th>{t("Tipo", "Type")}</th>
                    <th>{t("Finalidad", "Purpose")}</th>
                    <th>{t("Duración", "Duration")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td className="font-semibold text-foreground">{r.name}</td>
                      <td>{r.kind}</td>
                      <td>{r.purpose}</td>
                      <td>{r.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          heading: t("Sin analítica ni publicidad: sin banner", "No analytics or advertising: no banner"),
          body: (
            <p>
              {t(
                "Todos los elementos anteriores están exentos de consentimiento (art. 22.2 LSSI) por ser necesarios para el servicio que pides o para recordar una preferencia que has elegido. No usamos cookies de analítica, publicidad ni de terceros, por eso no mostramos un banner de cookies. Si algún día las añadimos, pediremos antes tu consentimiento y actualizaremos esta página.",
                "All the items above are exempt from consent (art. 22.2 Spanish LSSI) because they are needed for the service you request or to remember a preference you chose. We use no analytics, advertising or third-party cookies, which is why we show no cookie banner. If we ever add them, we will ask for your consent first and update this page."
              )}
            </p>
          ),
        },
        {
          heading: t("Cómo borrarlas", "How to remove them"),
          body: (
            <p>
              {t(
                "Puedes eliminar cookies y datos del sitio desde los ajustes de tu navegador. Si borras la cookie de sesión tendrás que volver a iniciar sesión; si borras la de invitado, el límite de invitado se seguirá aplicando por tu dirección IP. Más información en la",
                "You can delete cookies and site data from your browser settings. If you delete the session cookie you will need to sign in again; if you delete the guest cookie, the guest limit will still apply through your IP address. More in the"
              )}{" "}
              <Link href={href("/privacy")}>{t("política de privacidad", "privacy policy")}</Link>.
            </p>
          ),
        },
      ]}
    />
  )
}
