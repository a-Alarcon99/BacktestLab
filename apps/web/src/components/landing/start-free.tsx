import Link from "next/link"
import { ArrowRightIcon, ChevronDownIcon, UserIcon, UserPlusIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import type { Translate } from "@/lib/i18n"
import { getI18n } from "@/lib/i18n-server"
import type { PlanLimits } from "@/lib/plans"
import { SectionHeading } from "./section-heading"

type Limits = { guest?: PlanLimits; free?: PlanLimits }

/** Questions and answers of the landing (also published as FAQPage structured data). */
export function faqItems(t: Translate, { limits, since }: { limits: Limits; since: string }) {
  const guest = limits.guest?.maxBacktestsTotal
  const daily = limits.free?.maxBacktestsPerDay
  return [
    {
      q: t("¿Necesito saber programar?", "Do I need to know how to code?"),
      a: t(
        "No. Las reglas se construyen conectando bloques; la herramienta las traduce a lenguaje claro y te avisa si dos condiciones se contradicen.",
        "No. Rules are built by connecting blocks; the tool puts them into plain words and warns you if two conditions contradict each other."
      ),
    },
    {
      q: t("¿De dónde salen los datos?", "Where does the data come from?"),
      a: t(
        `De las velas OHLCV oficiales de Binance, desde ${since} en los activos más antiguos, en temporalidades de 1 minuto a 1 mes.`,
        `From Binance's official OHLCV candles, since ${since} for the oldest assets, in timeframes from 1 minute to 1 month.`
      ),
    },
    {
      q: t("¿Se tienen en cuenta las comisiones?", "Are fees taken into account?"),
      a: t(
        "Sí. Cada orden paga la comisión que configures en la estrategia y se ejecuta al cierre de la vela que da la señal, sin mirar velas futuras.",
        "Yes. Every order pays the fee you set in the strategy and fills at the close of the candle that gives the signal, without looking at future candles."
      ),
    },
    {
      q: t("¿Un buen backtest garantiza beneficios?", "Does a good backtest guarantee profits?"),
      a: t(
        "No. Un backtest muestra cómo se habría comportado una estrategia en el pasado, y el mercado cambia. Úsalo para descartar ideas, entender el riesgo (como el drawdown) y comparar con comprar y mantener, no como una promesa de resultados.",
        "No. A backtest shows how a strategy would have behaved in the past, and markets change. Use it to discard ideas, understand the risk (like the drawdown) and compare with buy & hold, not as a promise of results."
      ),
    },
    {
      q: t("¿Cuánto cuesta?", "How much does it cost?"),
      a: t(
        `Puedes probarlo sin registrarte${guest ? ` (${guest} backtests)` : ""}. Con una cuenta gratuita tienes${daily ? ` ${daily} backtests al día` : " más backtests"} y tus estrategias guardadas. Los planes de pago llegarán pronto.`,
        `You can try it without signing up${guest ? ` (${guest} backtests)` : ""}. A free account gives you${daily ? ` ${daily} backtests a day` : " more backtests"} and your saved strategies. Paid plans are coming soon.`
      ),
    },
  ]
}

/** Section 7: what you get for free, and the honest answers to the usual doubts. */
async function StartFree({ limits, since }: { limits: Limits; since: string }) {
  const { t, href } = await getI18n()
  const plural = (n: number | null | undefined, es: [string, string], en: [string, string]) =>
    n === 1 ? t(es[0], en[0]) : t(es[1], en[1])
  const tiers = [
    {
      Icon: UserIcon,
      name: t("Como invitado", "As a guest"),
      note: t("Sin registro", "No sign-up"),
      items: [
        limits.guest?.maxBacktestsTotal != null &&
          `${limits.guest.maxBacktestsTotal} ${plural(limits.guest.maxBacktestsTotal, ["backtest", "backtests"], ["backtest", "backtests"])}`,
        limits.guest?.maxStrategies != null &&
          `${limits.guest.maxStrategies} ${plural(limits.guest.maxStrategies, ["estrategia propia", "estrategias propias"], ["strategy of your own", "strategies of your own"])}`,
        t("Las 3 estrategias predefinidas", "The 3 built-in strategies"),
      ],
      cta: { href: href("/assets/btc"), text: t("Probar ahora", "Try it now"), primary: false },
    },
    {
      Icon: UserPlusIcon,
      name: t("Con cuenta gratuita", "With a free account"),
      note: t("Solo un correo", "Just an email"),
      items: [
        limits.free?.maxBacktestsPerDay != null && t(`${limits.free.maxBacktestsPerDay} backtests al día`, `${limits.free.maxBacktestsPerDay} backtests a day`),
        limits.free?.maxStrategies != null &&
          `${limits.free.maxStrategies} ${plural(limits.free.maxStrategies, ["estrategia guardada", "estrategias guardadas"], ["saved strategy", "saved strategies"])}`,
        t("Tus estrategias en cualquier navegador", "Your strategies on any browser"),
      ],
      cta: { href: href("/signup"), text: t("Crear cuenta", "Create account"), primary: true },
    },
  ]
  const faq = faqItems(t, { limits, since })

  return (
    <section aria-labelledby="free-title" className="container-page grid gap-10 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:py-24">
      <div className="flex flex-col gap-8">
        <SectionHeading
          id="free-title"
          kicker={t("Empieza gratis", "Start free")}
          title={t("Pruébalo hoy, sin tarjeta", "Try it today, no card needed")}
          lead={t(
            "Ejecuta tus primeros backtests sin crear una cuenta. Si te convence, regístrate gratis para guardar tus estrategias.",
            "Run your first backtests without an account. If you like it, sign up for free to keep your strategies."
          )}
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {tiers.map(({ Icon, name, note, items, cta }) => (
            <li key={name} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
              <span className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="flex flex-col">
                  <span className="font-bold">{name}</span>
                  <span className="text-caption text-muted-foreground">{note}</span>
                </span>
              </span>
              <ul className="flex flex-col gap-1.5">
                {items.filter(Boolean).map((item) => (
                  <li key={item as string} className="flex items-start gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={cta.href}
                className={buttonVariants({ variant: cta.primary ? "default" : "outline", className: "mt-auto self-start" })}
              >
                {cta.text}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-title font-bold">{t("Preguntas frecuentes", "Frequently asked questions")}</h3>
        <div className="divide-y rounded-2xl border bg-card">
          {faq.map(({ q, a }, i) => (
            <details key={q} className="group px-5" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold outline-none focus-visible:text-primary [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-4 text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export { StartFree }
