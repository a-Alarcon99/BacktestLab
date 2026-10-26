import type { ReactNode } from "react"
import { siteConfig } from "@/config/site"
import { intlLocale, type Locale } from "@/lib/i18n"

export type LegalSection = { heading: string; body: ReactNode }

/** Layout shared by the legal pages: title, last update, draft notice and numbered sections. */
export function LegalPage({
  locale,
  title,
  intro,
  sections,
  draftNotice,
}: {
  locale: Locale
  title: string
  intro: string
  sections: LegalSection[]
  draftNotice: string
}) {
  const updated = new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${siteConfig.legalUpdated}T00:00:00Z`)
  )
  return (
    <article className="container-page flex flex-col gap-8 py-10 lg:py-16">
      <header className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <h1>{title}</h1>
        <p className="text-caption text-muted-foreground">
          {locale === "es" ? "Última actualización" : "Last updated"}: {updated}
        </p>
        <p className="text-muted-foreground">{intro}</p>
        <p role="note" className="rounded-lg bg-muted px-3 py-2.5 text-caption text-muted-foreground">
          {draftNotice}
        </p>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {sections.map((section, i) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2>
              {i + 1}. {section.heading}
            </h2>
            <div className="flex flex-col gap-3 text-muted-foreground [&_a]:font-semibold [&_a]:text-primary [&_a]:hover:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
