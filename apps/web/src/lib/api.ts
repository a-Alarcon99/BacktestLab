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

/** Minimal typed fetch wrapper for the FastAPI backtesting service. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}
