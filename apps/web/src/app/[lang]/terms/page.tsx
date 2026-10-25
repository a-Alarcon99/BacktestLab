import type { Metadata } from "next"
import Link from "next/link"
import { draftNotice } from "@/components/legal/draft-notice"
import { LegalPage } from "@/components/legal/legal-page"
import { getI18n } from "@/lib/i18n-server"
import { pageMetadata } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n()
  return pageMetadata({
    locale,
    path: "/terms",
    title: t("Términos y condiciones", "Terms and conditions"),
    description: t(
      "Condiciones de uso de BacktestLab: simulación, sin asesoramiento financiero, límites por plan y uso aceptable.",
      "BacktestLab terms of use: simulation, no financial advice, plan limits and acceptable use."
    ),
  })
}

export default async function TermsPage() {
  const { locale, t, href } = await getI18n()
  const p = (es: string, en: string) => <p>{t(es, en)}</p>
  return (
    <LegalPage
      locale={locale}
      title={t("Términos y condiciones", "Terms and conditions")}
      intro={t(
        "Al crear una cuenta o usar BacktestLab aceptas estas condiciones. Si no estás de acuerdo, no uses el servicio.",
        "By creating an account or using BacktestLab you accept these terms. If you disagree, do not use the service."
      )}
      draftNotice={draftNotice(t)}
      sections={[
        {
          heading: t("El servicio", "The service"),
          body: p(
            "BacktestLab permite simular estrategias de trading sobre datos históricos de criptomonedas, en un rango de fechas y un timeframe elegidos, y consultar los resultados. Es una herramienta de análisis, no una plataforma de inversión: no ejecuta órdenes reales ni custodia fondos.",
            "BacktestLab lets you simulate trading strategies on historical cryptocurrency data over a chosen date range and timeframe, and review the results. It is an analysis tool, not an investment platform: it places no real orders and holds no funds."
          ),
        },
        {
          heading: t("No es asesoramiento financiero", "Not financial advice"),
          body: (
            <>
              {p(
                "Nada en BacktestLab constituye asesoramiento financiero, de inversión, fiscal o jurídico, ni una recomendación o invitación a comprar o vender ningún activo. Las estrategias predefinidas son ejemplos educativos.",
                "Nothing on BacktestLab is financial, investment, tax or legal advice, nor a recommendation or invitation to buy or sell any asset. The preset strategies are educational examples."
              )}
              {p(
                "Operar con criptoactivos conlleva un alto riesgo, incluida la pérdida total del capital. Toma tus decisiones por tu cuenta y, si lo necesitas, consulta a un profesional autorizado.",
                "Trading crypto-assets carries a high risk, including the loss of all your capital. Make your own decisions and, if needed, consult an authorised professional."
              )}
            </>
          ),
        },
        {
          heading: t("Rentabilidad pasada y simulación", "Past performance and simulation"),
          body: p(
            "Los resultados son simulaciones sobre datos pasados y no garantizan resultados futuros. Un backtest asume ejecuciones idealizadas (comisiones fijas, sin deslizamiento, liquidez ilimitada, ejecución a la apertura de la vela siguiente) que pueden no darse en el mercado real, y puede sufrir sobreajuste. Los datos de mercado proceden de terceros y pueden contener errores o huecos.",
            "Results are simulations on past data and do not guarantee future results. A backtest assumes idealised execution (fixed fees, no slippage, unlimited liquidity, execution at the next candle's open) that may not occur in the real market, and may suffer from overfitting. Market data comes from third parties and may contain errors or gaps."
          ),
        },
        {
          heading: t("Cuentas", "Accounts"),
          body: p(
            "Debes ser mayor de 18 años y facilitar un correo válido, que deberás verificar. Eres responsable de mantener la confidencialidad de tu contraseña y de la actividad de tu cuenta. Puedes pedir el borrado de tu cuenta cuando quieras escribiéndonos.",
            "You must be over 18 and provide a valid email, which you must verify. You are responsible for keeping your password confidential and for activity on your account. You can ask for your account to be deleted at any time by writing to us."
          ),
        },
        {
          heading: t("Límites por plan", "Plan limits"),
          body: p(
            "El uso está limitado según tu plan (invitado o cuenta): número de backtests, de estrategias y tamaño del historial. Los límites se aplican en el servidor; borrar estrategias o backtests no restaura la cuota consumida. Podemos modificar los planes y sus límites; avisaremos de los cambios relevantes en esta página o en el servicio. De momento no hay planes de pago.",
            "Usage is limited by your plan (guest or account): number of backtests, strategies and history size. Limits are enforced server-side; deleting strategies or backtests does not restore the quota used. We may change the plans and their limits; we will announce relevant changes on this page or in the service. There are currently no paid plans."
          ),
        },
        {
          heading: t("Uso aceptable y suspensión", "Acceptable use and suspension"),
          body: (
            <>
              {p(
                "Queda prohibido: eludir los límites de uso (por ejemplo, con varias cuentas o rotando direcciones IP), automatizar accesos masivos, atacar o sobrecargar el servicio, intentar acceder a datos de otros usuarios, hacer ingeniería inversa de la API interna o usar el servicio con fines ilícitos.",
                "It is forbidden to: bypass usage limits (for example with multiple accounts or rotating IP addresses), automate mass access, attack or overload the service, try to access other users' data, reverse-engineer the internal API or use the service for unlawful purposes."
              )}
              {p(
                "Podemos limitar, suspender o cancelar las cuentas que incumplan estas condiciones o abusen del servicio, con o sin previo aviso cuando sea necesario para proteger el servicio.",
                "We may limit, suspend or terminate accounts that breach these terms or abuse the service, with or without prior notice where needed to protect the service."
              )}
            </>
          ),
        },
        {
          heading: t("Propiedad intelectual", "Intellectual property"),
          body: p(
            "El software, el diseño y los textos de BacktestLab pertenecen a su titular. Las estrategias que creas siguen siendo tuyas; nos concedes el permiso necesario para almacenarlas y ejecutarlas con el fin de prestarte el servicio. Los datos de mercado pertenecen a sus proveedores.",
            "BacktestLab's software, design and texts belong to its owner. The strategies you create remain yours; you grant us the permission needed to store and run them to provide you the service. Market data belongs to its providers."
          ),
        },
        {
          heading: t("Disponibilidad y responsabilidad", "Availability and liability"),
          body: p(
            "El servicio se ofrece «tal cual», en fase beta, sin garantía de disponibilidad ni de ausencia de errores. En la medida permitida por la ley, no respondemos de pérdidas derivadas de decisiones tomadas a partir de los resultados, ni de interrupciones o inexactitudes de los datos. Nada de esto limita los derechos que la ley reconoce a los consumidores ni la responsabilidad que no pueda excluirse.",
            "The service is provided “as is”, in beta, with no guarantee of availability or error-free operation. To the extent permitted by law, we are not liable for losses arising from decisions made based on the results, nor for data interruptions or inaccuracies. None of this limits the rights the law grants to consumers or any liability that cannot be excluded."
          ),
        },
        {
          heading: t("Pagos, desistimiento y reembolsos", "Payments, withdrawal and refunds"),
          body: p(
            "Actualmente el servicio es gratuito. Si se incorporan planes de pago, esta sección recogerá precio, renovación, derecho de desistimiento y política de reembolsos antes de que puedas contratar.",
            "The service is currently free. If paid plans are introduced, this section will set out price, renewal, right of withdrawal and refund policy before you can subscribe."
          ),
        },
        {
          heading: t("Cambios, ley aplicable y contacto", "Changes, governing law and contact"),
          body: (
            <>
              {p(
                "Podemos actualizar estas condiciones; la fecha de arriba indica la última versión. Se rigen por la ley española; si eres consumidor, conservas los fueros que te reconozca la normativa aplicable y puedes acudir a la plataforma europea de resolución de litigios en línea.",
                "We may update these terms; the date above shows the latest version. They are governed by Spanish law; if you are a consumer you keep the venue rights granted by applicable rules and may use the EU online dispute resolution platform."
              )}
              <p>
                {t("Datos del titular en el", "Provider details in the")}{" "}
                <Link href={href("/legal")}>{t("aviso legal", "legal notice")}</Link>.{" "}
                {t("Tratamiento de datos:", "Data processing:")}{" "}
                <Link href={href("/privacy")}>{t("política de privacidad", "privacy policy")}</Link>.
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
