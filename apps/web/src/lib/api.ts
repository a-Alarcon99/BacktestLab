const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Raw response body (FastAPI errors: `{"detail": ...}`). */
    readonly body: string,
  ) {
    super(`API ${status}: ${body}`);
  }
}

/**
 * Upper bound of one call. Generous because the free API instance can take ~60 s to wake up, but
 * finite: on the server a hung API would otherwise hold the render until the platform kills it.
 */
const API_TIMEOUT_MS = 55_000;

/** Minimal typed fetch wrapper for the FastAPI backtesting service. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}
