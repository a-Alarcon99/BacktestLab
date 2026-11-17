import type { Metadata } from "next"
import Link from "next/link"
import { DocsToc } from "@/components/docs/toc"
import { BuilderSection, StartSection } from "@/components/docs/sections-basics"
import { AccountsSection, EngineSection, ResultsSection, RobustnessSection, TipsSection } from "@/components/docs/sections-engine"
import { getI18n } from "@/lib/i18n-server"
import { pageMetadata } from "@/lib/seo"

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n()
  return pageMetadata({
    locale,
    path: "/docs",
    title: t("Documentación", "Documentation"),
    description: t(
      "Guía de BacktestLab: cómo crear estrategias, cómo funciona el motor de backtesting, cómo leer los resultados y consejos para no engañarte.",
      "BacktestLab guide: how to build strategies, how the backtesting engine works, how to read the results and tips to avoid fooling yourself."
    ),
  })
}

export default async function DocsPage() {
  const { t, href } = await getI18n()
  const sections = [
    { id: "start", label: t("Primeros pasos", "Getting started") },
    { id: "builder", label: t("Constructor de estrategias", "Strategy builder") },
    { id: "engine", label: t("Cómo funciona", "How it works") },
    { id: "results", label: t("Resultados", "Results") },
    { id: "robustness", label: t("Análisis avanzado", "Advanced analysis") },
    { id: "accounts", label: t("Cuentas y cupos", "Accounts and quotas") },
    { id: "tips", label: t("Consejos", "Tips") },
  ]
  const indexLabel = t("En esta página", "On this page")
  return (
    <div className="container-page flex flex-col gap-10 py-10 lg:py-16">
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-balance lg:text-[2.5rem] lg:leading-[3rem]">{t("Documentación", "Documentation")}</h1>
        <p className="text-lead text-pretty text-muted-foreground">
          {t(
            "Todo lo que necesitas para sacarle partido a BacktestLab: cómo se usa, cómo funciona por dentro y qué consejos conviene seguir. Está escrita para que la entienda cualquiera, y cuando hay detalles técnicos se explican con palabras sencillas.",
            "Everything you need to get the most out of BacktestLab: how to use it, how it works inside and which tips are worth following. It is written for everyone, and when there are technical details they are explained in plain words."
          )}
        </p>
        <p className="text-muted-foreground">
          {t("¿Prefieres empezar ya? ", "Would you rather start right away? ")}
          <Link href={href("/backtests")} className="font-semibold text-primary hover:underline">
            {t("Ir a Backtests", "Go to Backtests")}
          </Link>
        </p>
      </header>

      <details className="rounded-2xl border bg-card px-4 py-3 lg:hidden">
        <summary className="cursor-pointer font-semibold">{indexLabel}</summary>
        <nav aria-label={indexLabel} className="mt-3">
          <ol className="flex flex-col gap-1">
            {sections.map((section, i) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="flex gap-2.5 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <span className="num text-caption leading-6 opacity-70">{i + 1}</span>
                  {section.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </details>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--spacing-header)+2rem)]">
            <DocsToc items={sections} label={indexLabel} />
          </div>
        </aside>
        <article className="flex max-w-3xl flex-col gap-16 lg:gap-20">
          <StartSection />
          <BuilderSection />
          <EngineSection />
          <ResultsSection />
          <RobustnessSection />
          <AccountsSection />
          <TipsSection />
        </article>
      </div>
    </div>
  )
}
