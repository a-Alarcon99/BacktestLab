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
