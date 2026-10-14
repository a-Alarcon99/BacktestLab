import { headers } from "next/headers";

import { apiError, limitResponse } from "@/lib/server/http";
import { clientIp, isSameOrigin, resolveIdentity } from "@/lib/server/identity";
import { consumeBacktest, LimitError, refundBacktest, requestHash } from "@/lib/server/quota";
import { readJson } from "@/lib/server/strategy-input";

// Node resolves `localhost` to ::1 first on some setups while uvicorn listens on 127.0.0.1 only
// (the browser retries both, server-side fetch may not), so the loopback name is pinned to IPv4.
const API_URL = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000")
  .replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, "$1127.0.0.1")
  .replace(/\/+$/, "");
const UPSTREAM_TIMEOUT_MS = 120_000;

/**
 * The only path to the backtest engine: the quota is consumed here, before anything runs, and the
 * API rejects calls that don't carry the shared internal key (so it can't be called directly).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Origen no permitido.");
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) return apiError(503, "not_configured", "El servidor de backtesting no está configurado.");

  const body = await readJson(request);
  if (typeof body !== "object" || body === null) return apiError(400, "bad_request", "Petición no válida.");

  const identity = await resolveIdentity({ createGuest: true });
  const hash = requestHash(body);

  let charge: { charged: boolean };
  try {
    charge = await consumeBacktest(identity, hash);
  } catch (error) {
    if (error instanceof LimitError) return limitResponse(error);
    throw error;
  }

  // Only what the engine needs is forwarded, with the client IP we resolved (for its rate limits).
  const ip = clientIp(await headers());
  try {
    const upstream = await fetch(`${API_URL}/backtests/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": internalKey, "X-Forwarded-For": ip },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    // A run the engine refused or failed is not the user's consumption.
    if (!upstream.ok && charge.charged) await refundBacktest(identity, hash);
    // 401/503 mean the engine rejected *this app* (missing or different INTERNAL_API_KEY), not the
    // request: report it as a server problem instead of relaying a confusing status.
    if (upstream.status === 401 || upstream.status === 503) {
      const detail = (await upstream.text()).slice(0, 300);
      console.error(`Backtest engine refused the proxied call (${upstream.status}): ${detail}`);
      if (upstream.status === 401 || detail.includes("not configured"))
        return apiError(502, "engine_misconfigured", "El motor de backtesting no acepta las peticiones de la web.");
      return apiError(503, "engine_busy", "El motor de backtesting está ocupado. Inténtalo de nuevo en unos segundos.");
    }
    const retryAfter = upstream.headers.get("retry-after");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      },
    });
  } catch (error) {
    console.error(`Backtest engine unreachable at ${API_URL}:`, error);
    if (charge.charged) await refundBacktest(identity, hash);
    return apiError(502, "upstream_unavailable", "El servidor de backtesting no responde.");
  }
}
