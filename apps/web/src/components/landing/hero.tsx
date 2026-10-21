import Link from "next/link"
import { ArrowRightIcon, CheckIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { getI18n } from "@/lib/i18n-server"
import { ReplayArt } from "./art/replay-art"

/** Section 1: the promise, the call to action and the replay of a real backtest. */
async function Hero({ guestBacktests, since }: { guestBacktests: number | null; since: string }) {
  const { t, href } = await getI18n()
  const trust = [
    t("Sin registro", "No sign-up"),
    guestBacktests
      ? t(`${guestBacktests} backtests gratis como invitado`, `${guestBacktests} free backtests as a guest`)
      : t("Prueba gratis", "Free to try"),
    t(`Datos de Binance desde ${since}`, `Binance data since ${since}`),
  ]

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero" />
      <div className="container-page grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14 lg:py-20">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-caption font-semibold text-muted-foreground shadow-xs backdrop-blur">
            <span className="size-1.5 rounded-full bg-primary" />
            {t("Backtesting de criptomonedas sin código", "No-code crypto backtesting")}
          </span>
          <h1 id="hero-title" className="text-display font-bold tracking-tight text-balance lg:text-display-lg">
            {t("Prueba tu estrategia con datos reales ", "Test your strategy on real data ")}
            <span className="text-primary">{t("antes de arriesgar un euro", "before you risk a cent")}</span>
          </h1>
          <p className="max-w-xl text-lead text-pretty text-muted-foreground">
            {t(
              "Diseña reglas de compra y venta conectando bloques, ejecútalas sobre años de velas reales y mira, vela a vela, cómo se habrían comportado. Sin programar.",
              "Design buy and sell rules by connecting blocks, run them over years of real candles and watch, candle by candle, how they would have played out. No coding."
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={href("/assets/btc")} className={buttonVariants({ size: "lg", className: "h-11 px-6 text-body" })}>
              {t("Probar gratis", "Try it free")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
            <Link
              href={href("/strategies")}
              className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-6 text-body" })}
            >
              {t("Ver estrategias", "Browse strategies")}
            </Link>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-caption text-muted-foreground">
            {trust.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <ReplayArt />
      </div>
    </section>
  )
}

export { Hero }
