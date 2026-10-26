import type { LimitError } from "./quota";

/** JSON error with a stable `code` the client maps to a message. */
export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ code, message, ...extra }, { status });
}

export function limitResponse(error: LimitError) {
  const messages = {
    strategies: "Has alcanzado el máximo de estrategias que puedes crear con tu plan.",
    backtests_total: "Has alcanzado el máximo de backtests de tu plan.",
    backtests_daily: "Has alcanzado el máximo de backtests de hoy. Vuelve mañana (UTC).",
  } as const;
  const message =
    error.needed > 1
      ? `Esta ejecución necesita ${error.needed} backtests y no te quedan suficientes en tu plan.`
      : messages[error.kind];
  return apiError(429, "limit_reached", message, { limit: error.kind, max: error.max, needed: error.needed });
}
