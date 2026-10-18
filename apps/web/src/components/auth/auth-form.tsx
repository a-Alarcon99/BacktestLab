"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LoaderCircleIcon } from "lucide-react"
import { useI18n } from "@/components/i18n/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import type { Translate } from "@/lib/i18n"
import { refreshMe } from "@/lib/session"

type Mode = "login" | "signup"

const copyOf = (t: Translate) =>
  ({
    login: {
      title: t("Iniciar sesión", "Sign in"),
      submit: t("Entrar", "Sign in"),
      alt: { text: t("¿Aún no tienes cuenta?", "Don't have an account yet?"), href: "/signup", label: t("Crear cuenta", "Sign up") },
    },
    signup: {
      title: t("Crear cuenta", "Create account"),
      submit: t("Crear cuenta", "Create account"),
      alt: { text: t("¿Ya tienes cuenta?", "Already have an account?"), href: "/login", label: t("Entrar", "Sign in") },
    },
  }) as const

/** Maps Better Auth failures to messages. Login errors stay generic so they don't reveal accounts. */
function describeAuthError(error: { status?: number; code?: string }, mode: Mode, t: Translate) {
  if (error.status === 429)
    return t(
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      "Too many attempts. Wait a few minutes before trying again."
    )
  switch (error.code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return t(
        "No se pudo crear la cuenta con ese correo. Prueba a iniciar sesión.",
        "Couldn't create an account with that email. Try signing in."
      )
    case "PASSWORD_TOO_SHORT":
      return t("La contraseña debe tener al menos 8 caracteres.", "The password must be at least 8 characters long.")
    case "PASSWORD_TOO_LONG":
      return t("La contraseña es demasiado larga (máximo 128 caracteres).", "The password is too long (128 characters at most).")
    case "EMAIL_NOT_VERIFIED":
      return t(
        "Debes verificar tu correo antes de entrar. Te hemos enviado un nuevo enlace de verificación.",
        "You need to verify your email before signing in. We've sent you a new verification link."
      )
    case "INVALID_EMAIL":
      return t("El correo electrónico no es válido.", "The email address isn't valid.")
  }
  return mode === "login"
    ? t("Correo o contraseña incorrectos.", "Wrong email or password.")
    : t("No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.", "Couldn't create the account. Check your details and try again.")
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fieldError = (message?: string) => message && <span className="font-semibold text-down">{message}</span>

function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const { t, href } = useI18n()
  const c = copyOf(t)[mode]
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (mode === "signup" && name.trim().length < 2) next.name = t("Escribe tu nombre.", "Enter your name.")
    if (!emailPattern.test(email.trim())) next.email = t("Introduce un correo válido.", "Enter a valid email.")
    if (mode === "signup" ? password.length < 8 || password.length > 128 : password.length === 0)
      next.password =
        mode === "signup" ? t("Entre 8 y 128 caracteres.", "Between 8 and 128 characters.") : t("Escribe tu contraseña.", "Enter your password.")
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0) return

    setPending(true)
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: href("/strategies") })
          : await authClient.signIn.email({ email: email.trim(), password, callbackURL: href("/strategies") })
      if (result.error) {
        setFormError(describeAuthError(result.error, mode, t))
        setPassword("")
        setPending(false)
        return
      }
    } catch {
      setFormError(t("No se pudo conectar con el servidor. Inténtalo de nuevo.", "Couldn't reach the server. Try again."))
      setPending(false)
      return
    }
    if (mode === "signup") {
      // The account stays inactive until the emailed link is followed.
      setSentTo(email.trim())
      setPending(false)
      return
    }
    // Pick up the account's plan (and adopt strategies created as a guest) before leaving.
    await refreshMe()
    router.push(href("/strategies"))
    router.refresh()
  }

  if (sentTo) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("Revisa tu correo", "Check your email")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-muted-foreground">
          <p>
            {t("Hemos enviado un enlace de verificación a ", "We've sent a verification link to ")}
            <strong className="text-foreground">{sentTo}</strong>
            {t(
              ". Ábrelo para activar tu cuenta; caduca en 1 hora.",
              ". Open it to activate your account; it expires in 1 hour."
            )}
          </p>
          <p className="text-caption">
            {t(
              "¿No llega? Mira en spam o intenta iniciar sesión: te enviaremos otro enlace.",
              "Not there? Check your spam folder or try signing in: we'll send you another link."
            )}
          </p>
          <Link href={href("/login")} className="font-semibold text-primary hover:underline">
            {t("Ir a iniciar sesión", "Go to sign in")}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{c.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <Field label={t("Nombre", "Name")} htmlFor="name" hint={fieldError(errors.name)}>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field label={t("Correo electrónico", "Email")} htmlFor="email" hint={fieldError(errors.email)}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            label={t("Contraseña", "Password")}
            htmlFor="password"
            hint={fieldError(errors.password) || (mode === "signup" ? t("Mínimo 8 caracteres.", "At least 8 characters.") : undefined)}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {formError && (
            <p role="alert" className="rounded-lg bg-down-soft px-3 py-2.5 text-caption font-semibold text-down">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />}
            {c.submit}
          </Button>
          <p className="text-center text-caption text-muted-foreground">
            {c.alt.text}{" "}
            <Link href={href(c.alt.href)} className="font-semibold text-primary hover:underline">
              {c.alt.label}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export { AuthForm }
