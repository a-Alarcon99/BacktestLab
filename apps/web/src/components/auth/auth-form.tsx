"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LoaderCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { refreshMe } from "@/lib/session"

type Mode = "login" | "signup"

const copy = {
  login: {
    title: "Iniciar sesión",
    submit: "Entrar",
    alt: { text: "¿Aún no tienes cuenta?", href: "/signup", label: "Crear cuenta" },
  },
  signup: {
    title: "Crear cuenta",
    submit: "Crear cuenta",
    alt: { text: "¿Ya tienes cuenta?", href: "/login", label: "Entrar" },
  },
} as const

/** Maps Better Auth failures to messages. Login errors stay generic so they don't reveal accounts. */
function describeAuthError(error: { status?: number; code?: string }, mode: Mode) {
  if (error.status === 429) return "Demasiados intentos. Espera unos minutos antes de volver a intentarlo."
  switch (error.code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "No se pudo crear la cuenta con ese correo. Prueba a iniciar sesión."
    case "PASSWORD_TOO_SHORT":
      return "La contraseña debe tener al menos 8 caracteres."
    case "PASSWORD_TOO_LONG":
      return "La contraseña es demasiado larga (máximo 128 caracteres)."
    case "EMAIL_NOT_VERIFIED":
      return "Debes verificar tu correo antes de entrar. Te hemos enviado un nuevo enlace de verificación."
    case "INVALID_EMAIL":
      return "El correo electrónico no es válido."
  }
  return mode === "login"
    ? "Correo o contraseña incorrectos."
    : "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo."
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fieldError = (message?: string) => message && <span className="font-semibold text-down">{message}</span>

function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const c = copy[mode]
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
    if (mode === "signup" && name.trim().length < 2) next.name = "Escribe tu nombre."
    if (!emailPattern.test(email.trim())) next.email = "Introduce un correo válido."
    if (mode === "signup" ? password.length < 8 || password.length > 128 : password.length === 0)
      next.password = mode === "signup" ? "Entre 8 y 128 caracteres." : "Escribe tu contraseña."
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0) return

    setPending(true)
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/strategies" })
          : await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/strategies" })
      if (result.error) {
        setFormError(describeAuthError(result.error, mode))
        setPassword("")
        setPending(false)
        return
      }
    } catch {
      setFormError("No se pudo conectar con el servidor. Inténtalo de nuevo.")
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
    router.push("/strategies")
    router.refresh()
  }

  if (sentTo) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-muted-foreground">
          <p>
            Hemos enviado un enlace de verificación a <strong className="text-foreground">{sentTo}</strong>. Ábrelo
            para activar tu cuenta; caduca en 1 hora.
          </p>
          <p className="text-caption">
            ¿No llega? Mira en spam o intenta iniciar sesión: te enviaremos otro enlace.
          </p>
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Ir a iniciar sesión
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
            <Field label="Nombre" htmlFor="name" hint={fieldError(errors.name)}>
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
          <Field label="Correo electrónico" htmlFor="email" hint={fieldError(errors.email)}>
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
            label="Contraseña"
            htmlFor="password"
            hint={fieldError(errors.password) || (mode === "signup" ? "Mínimo 8 caracteres." : undefined)}
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
            <Link href={c.alt.href} className="font-semibold text-primary hover:underline">
              {c.alt.label}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export { AuthForm }
