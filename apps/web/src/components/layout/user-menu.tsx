"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOutIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { refreshMe, useMe } from "@/lib/session"
import { clearBacktestHistory } from "@/lib/storage/backtests"

/** Session actions: sign-in / sign-up for guests, account name + sign-out for accounts. */
function UserMenu({ stacked = false }: { stacked?: boolean }) {
  const router = useRouter()
  const me = useMe()
  const { t, href } = useI18n()

  if (me === undefined) return <div aria-hidden className="h-9 w-40 animate-pulse rounded-lg bg-muted/40" />

  if (!me.user) {
    return (
      <div className={stacked ? "grid grid-cols-2 gap-3" : "flex items-center gap-2"}>
        <Link href={href("/login")} className={buttonVariants({ variant: "outline", size: stacked ? "lg" : "default" })}>
          {t("Entrar", "Sign in")}
        </Link>
        <Link href={href("/signup")} className={buttonVariants({ size: stacked ? "lg" : "default" })}>
          {t("Crear cuenta", "Sign up")}
        </Link>
      </div>
    )
  }

  const signOut = async () => {
    await authClient.signOut()
    // The history lives in this browser: don't leave it for the next person.
    clearBacktestHistory()
    await refreshMe()
    router.push(href("/"))
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate font-semibold xl:inline" title={me.user.email}>
        {me.user.name}
      </span>
      <Badge variant="primary">{me.plan.name}</Badge>
      <Button variant="outline" size="icon" aria-label={t("Cerrar sesión", "Sign out")} onClick={signOut}>
        <LogOutIcon />
      </Button>
    </div>
  )
}

export { UserMenu }
