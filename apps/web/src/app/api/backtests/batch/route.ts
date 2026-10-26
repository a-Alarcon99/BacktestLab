import { batchPlanProblem, failedItems, parseBatchBody } from "@/lib/server/batch-input";
import { apiError, limitResponse } from "@/lib/server/http";
import { enforce, perClient, tooManyRequests } from "@/lib/server/rate-limit";
import { clientIp, isSameOrigin, resolveIdentity } from "@/lib/server/identity";
import { consumeBacktest, LimitError, refundBacktest, requestHash } from "@/lib/server/quota";
import { readJson } from "@/lib/server/strategy-input";

// Same loopback pinning as `run/route.ts` (see there).
const API_URL = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000")
  .replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, "$1127.0.0.1")
  .replace(/\/+$/, "");
const UPSTREAM_TIMEOUT_MS = 120_000;
export const maxDuration = 130;

/** The engine did not (or could not) execute the request, so its quota is returned. */
const shouldRefund = (status: number) => (status >= 400 && status < 500) || status === 503;

/**
 * Multi-run: the same strategy over several assets, rolling windows, varied parameters or
 * neighbouring timeframes. Like `run`, it is the only path to the engine's batch endpoint. It
 * charges one backtest per simulation, a number worked out here from the request, and gives back
 * the units of what the engine refused (everything) or could not run (no candles in the range).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Origen no permitido.");
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) return apiError(503, "not_configured", "El servidor de backtesting no está configurado.");

  // Heavier than a single run, so tighter caps; address and global caps before any DB access.
  const ip = clientIp(request.headers);
  const preWait = await enforce([...perClient("batch:ip", ip, 12, 60), ["batch:global", 60, 60]]);
  if (preWait > 0) return tooManyRequests(preWait);

  const input = parseBatchBody(await readJson(request));
  if (!input) return apiError(400, "bad_request", "Petición no válida.");

  const identity = await resolveIdentity({ createGuest: true });
  const wait = await enforce([
    [`batch:subject:${identity.key}:m`, 6, 60],
    [`batch:subject:${identity.key}:h`, 40, 3600],
  ]);
  if (wait > 0) return tooManyRequests(wait);

  const { plan } = identity;
  const problem = input.kind === "mc-paths" ? null : batchPlanProblem(input.units, plan.maxBatchItems);
  if (input.kind === "mc-paths" && input.paths !== undefined) {
    if (plan.maxMcPaths <= 0)
      return apiError(403, "mc_not_allowed", "Tu plan no incluye Monte Carlo sobre caminos sintéticos.", { max: plan.maxMcPaths });
    if (input.paths > plan.maxMcPaths)
      return apiError(422, "mc_too_many", `Tu plan permite hasta ${plan.maxMcPaths} caminos por ejecución.`, { max: plan.maxMcPaths });
  }
  if (problem === "not_allowed")
    return apiError(403, "batch_not_allowed", "Tu plan no permite ejecutar varias simulaciones a la vez.", { max: plan.maxBatchItems });
  if (problem === "too_many")
    return apiError(422, "batch_too_many", `Tu plan permite hasta ${plan.maxBatchItems} simulaciones por ejecución.`, { max: plan.maxBatchItems });

  const { units } = input;
  const hash = requestHash(input.hashBody);
  let charge: { charged: boolean };
  try {
    charge = await consumeBacktest(identity, hash, units);
  } catch (error) {
    if (error instanceof LimitError) return limitResponse(error);
    throw error;
  }

  const forwardedFor = ip === "unknown" ? identity.key : ip;
  try {
    const upstream = await fetch(`${API_URL}/backtests/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": internalKey, "X-Forwarded-For": forwardedFor },
      body: JSON.stringify(input.forward),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (charge.charged && shouldRefund(upstream.status)) await refundBacktest(identity, hash, units);
    if (upstream.status === 401 || upstream.status === 503) {
      const detail = (await upstream.text()).slice(0, 300);
      console.error(`Backtest engine refused the proxied batch (${upstream.status}): ${detail}`);
      if (upstream.status === 401 || detail.includes("not configured"))
        return apiError(502, "engine_misconfigured", "El motor de backtesting no acepta las peticiones de la web.");
      return apiError(503, "engine_busy", "El motor de backtesting está ocupado. Inténtalo de nuevo en unos segundos.");
    }
    const retryAfter = upstream.headers.get("retry-after");
    const headers = {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": retryAfter } : {}),
    };
    if (upstream.status !== 200) return new Response(upstream.body, { status: upstream.status, headers });
    // The result is read whole to give back the assets that had nothing to run on.
    const text = await upstream.text();
    const failed = failedItems(text);
    if (charge.charged && failed > 0) await refundBacktest(identity, hash, Math.min(failed, units), true);
    return new Response(text, { status: 200, headers });
  } catch (error) {
    console.error(`Backtest engine unreachable at ${API_URL}:`, error);
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    if (charge.charged && !timedOut) await refundBacktest(identity, hash, units);
    return apiError(502, "upstream_unavailable", "El servidor de backtesting no responde.");
  }
}
