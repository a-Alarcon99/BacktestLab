"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDownIcon, LogOutIcon, Trash2Icon, UserRoundIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth-client"
import { refreshMe, useMe } from "@/lib/session"
import { clearBacktestHistory } from "@/lib/storage/backtests"

/** Session actions: sign-in / sign-up for guests, account name + sign-out for accounts. */
function UserMenu({ stacked = false }: { stacked?: boolean }) {
  const router = useRouter()
  const me = useMe()
  const { t, href } = useI18n()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  // The history lives in this browser: don't leave it for the next person.
  const leave = async () => {
    clearBacktestHistory()
    await refreshMe()
    router.push(href("/"))
    router.refresh()
  }

  const signOut = async () => {
    await authClient.signOut()
    await leave()
  }

  const deleteAccount = async () => {
    setDeleteError(null)
    try {
      const { error } = await authClient.deleteUser()
      if (error) {
        setDeleteError(
          error.code === "SESSION_EXPIRED"
            ? t(
                "Por seguridad, cierra sesión, vuelve a entrar y repite la operación.",
                "For security, sign out, sign back in and try again."
              )
            : t("No se pudo eliminar la cuenta. Inténtalo de nuevo.", "Couldn't delete the account. Try again.")
        )
        setConfirmDelete(true)
        return
      }
    } catch {
      setDeleteError(t("No se pudo conectar con el servidor. Inténtalo de nuevo.", "Couldn't reach the server. Try again."))
      setConfirmDelete(true)
      return
    }
    await leave()
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("Cuenta", "Account")}
          className="inline-flex h-9 max-w-full items-center gap-2 rounded-lg border bg-background px-2.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted"
        >
          <UserRoundIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="max-w-40 truncate font-semibold" title={me.user.email}>
            {me.user.name}
          </span>
          <Badge variant="primary">{me.plan.name}</Badge>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-52">
          <p className="truncate px-2.5 py-1.5 text-caption text-muted-foreground">{me.user.email}</p>
          <DropdownMenuItem
            onClick={() => {
              setDeleteError(null)
              setConfirmDelete(true)
            }}
            className="text-destructive"
          >
            <Trash2Icon className="size-4" />
            {t("Eliminar cuenta", "Delete account")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="icon" data-close-menu aria-label={t("Cerrar sesión", "Sign out")} onClick={signOut}>
        <LogOutIcon />
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("¿Eliminar tu cuenta?", "Delete your account?")}
        description={
          <>
            {t(
              "Se borrarán tu cuenta, tus estrategias y tus datos de uso. No se puede deshacer.",
              "Your account, strategies and usage data will be deleted. This can't be undone."
            )}
            {deleteError && <span className="mt-2 block font-semibold text-down">{deleteError}</span>}
          </>
        }
        confirmLabel={t("Sí, eliminar cuenta", "Yes, delete account")}
        onConfirm={deleteAccount}
      />
    </div>
  )
}

export { UserMenu }
