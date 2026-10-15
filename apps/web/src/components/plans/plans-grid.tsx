"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SegmentedControl } from "@/components/ui/segmented-control"
import type { PublicPlan } from "@/lib/plans"
import { useMe } from "@/lib/session"

type Period = "month" | "year"

const usd = (cents: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100)

/**
 * Presentational plan cards. There is no payment provider yet, so paid plans only show
 * "Próximamente"; `/plans` doesn't render this grid until checkout exists.
 */
/** Limits come from the plan row; marketing bullets that repeat a limit are not shown twice. */
const repeatsLimit = (feature: string) => /backtests al día|estrategias|historial/i.test(feature)

function PlansGrid({ plans }: { plans: PublicPlan[] }) {
  const me = useMe()
  const [period, setPeriod] = useState<Period>("month")
  return (
    <div className="flex flex-col items-center gap-6">
      <SegmentedControl
        label="Periodo de facturación"
        options={["month", "year"] as const}
        value={period}
        onValueChange={setPeriod}
        labels={{ month: "Mensual", year: "Anual · 2 meses gratis" }}
      />
      <div className="grid w-full gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const cents = period === "month" ? plan.priceMonthlyCents : plan.priceYearlyCents
          const current = me?.plan.id === plan.id
          const expires = current && me?.plan.expiresAt ? new Date(me.plan.expiresAt) : null
          const bullets = [
            plan.maxBacktestsPerDay === null ? "Backtests ilimitados" : `${plan.maxBacktestsPerDay} backtests al día`,
            plan.maxStrategies === null ? "Estrategias ilimitadas" : `Hasta ${plan.maxStrategies} estrategias`,
            `Historial de ${plan.historySize} backtests`,
            ...plan.features.filter((f) => !repeatsLimit(f)),
          ]
          return (
            <Card
              key={plan.id}
              className={`flex flex-col gap-5 p-5 ${plan.id === "pro" ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  {current ? (
                    <Badge variant="primary">Tu plan</Badge>
                  ) : (
                    plan.id === "pro" && <Badge variant="up">Popular</Badge>
                  )}
                </div>
                {plan.tagline && <p className="text-caption text-muted-foreground">{plan.tagline}</p>}
              </div>

              <div className="flex flex-col">
                <span className="num text-3xl font-bold">{cents === null ? "0 $" : usd(cents)}</span>
                <span className="text-caption text-muted-foreground">
                  {cents === null
                    ? "para siempre"
                    : period === "month"
                      ? "al mes"
                      : `al año · ${usd(Math.round(cents / 12))}/mes`}
                </span>
              </div>

              <ul className="flex flex-col gap-2 text-sm">
                {bullets.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-up" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex flex-col gap-2 pt-2">
                {cents === null ? (
                  me?.user ? (
                    <Button variant="outline" disabled>
                      {current ? "Plan actual" : "Incluido"}
                    </Button>
                  ) : (
                    <Link href="/signup" className={buttonVariants({ variant: "outline" })}>
                      Crear cuenta gratis
                    </Link>
                  )
                ) : !me ? (
                  <Button disabled>Cargando…</Button>
                ) : (
                  <Button disabled>Próximamente</Button>
                )}
                {expires && (
                  <span className="text-center text-caption text-muted-foreground">
                    Activo hasta el {expires.toLocaleDateString("es-ES")}
                  </span>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export { PlansGrid }
