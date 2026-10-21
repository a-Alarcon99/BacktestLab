import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { getI18n } from "@/lib/i18n-server"
import { cn } from "@/lib/utils"

/** Closing call to action. */
async function FinalCta({ assets }: { assets: number }) {
  const { t, href } = await getI18n()
  return (
    <section className="container-page pb-16 lg:pb-24">
      <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12 lg:py-16">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(to_right,rgb(255_255_255/0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.18)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_80%_at_50%_0%,black,transparent)]"
        />
        <div aria-hidden className="absolute -top-24 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full bg-white/20 blur-3xl" />
        <h2 className="mx-auto max-w-2xl text-section font-bold tracking-tight text-balance lg:text-[2.5rem] lg:leading-[3rem]">
          {t("Tu próxima idea de trading, probada en minutos", "Your next trading idea, tested in minutes")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lead text-primary-foreground/80">
          {t(
            "Elige un activo, conecta tus reglas y descubre si tu estrategia habría funcionado antes de poner dinero real.",
            "Pick an asset, wire up your rules and find out whether your strategy would have worked before you put real money in."
          )}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={href("/assets/btc")}
            className={cn(buttonVariants({ size: "lg" }), "h-11 bg-white px-6 text-body text-primary hover:bg-white/90")}
          >
            {t("Probar gratis", "Try it free")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
          <Link
            href={href("/assets")}
            className={cn(
              buttonVariants({ size: "lg", variant: "ghost" }),
              "h-11 border border-white/40 px-6 text-body text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            )}
          >
            {t(`Ver los ${assets} activos`, `See all ${assets} assets`)}
          </Link>
        </div>
      </div>
    </section>
  )
}

export { FinalCta }
