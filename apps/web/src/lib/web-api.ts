import { translator, type Locale } from "@/lib/i18n"

// Client for this app's own route handlers (`/api/*`). Errors carry the server's stable `code`.

export class WebApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly limit?: "strategies" | "backtests_total" | "backtests_daily",
    /** FastAPI error payload (`detail`) when the response is relayed from the engine. */
    readonly detail?: unknown,
  ) {
    super(message)
  }
}

/**
 * Text of a failed call in the UI language. The route handlers answer in Spanish; the cases a user
 * can hit are recognized by their stable `code` and translated here.
 */
export function describeWebError(error: unknown, locale: Locale, fallback: string): string {
  const t = translator(locale)
  if (!(error instanceof WebApiError)) return error instanceof Error && locale === "es" ? error.message : fallback
  if (error.code === "network") return t("No se pudo conectar con el servidor.", "Couldn't reach the server.")
  if (error.code === "limit_reached") {
    switch (error.limit) {
      case "strategies":
        return t(error.message, "You've reached the maximum number of strategies your plan allows.")
      case "backtests_total":
        return t(error.message, "You've reached your plan's maximum number of backtests.")
      case "backtests_daily":
        return t(error.message, "You've reached today's maximum number of backtests. Come back tomorrow (UTC).")
    }
  }
  if (error.status === 429) return t(error.message, "Too many requests. Wait a moment before trying again.")
  return locale === "es" ? error.message : fallback
}

export async function webFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    })
  } catch {
    throw new WebApiError(0, "network", "No se pudo conectar con el servidor.")
  }
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    let body: { code?: string; message?: string; limit?: WebApiError["limit"]; detail?: unknown } = {}
    try {
      body = await res.json()
    } catch {}
    throw new WebApiError(res.status, body.code ?? "error", body.message ?? "La operación ha fallado.", body.limit, body.detail)
  }
  return (await res.json()) as T
}
