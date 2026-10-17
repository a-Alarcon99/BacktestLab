import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { backtestRuns } from "@/db/schema";
import { apiError } from "@/lib/server/http";
import { clientIp, isSameOrigin, resolveIdentity } from "@/lib/server/identity";
import { requestHash } from "@/lib/server/quota";
import { enforce, perClient, tooManyRequests } from "@/lib/server/rate-limit";
import { readJson } from "@/lib/server/strategy-input";

export const maxDuration = 10;

/**
 * Called when a run is deleted from the history: it stops being a free re-run. The consumed quota
 * is NOT given back (counters are untouched), so running it again costs a backtest again.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Origen no permitido.");
  const preWait = await enforce([...perClient("forget:ip", clientIp(request.headers), 30, 60), ["forget:global", 600, 60]]);
  if (preWait > 0) return tooManyRequests(preWait);
  const body = await readJson(request);
  if (typeof body !== "object" || body === null) return apiError(400, "bad_request", "Petición no válida.");
  const identity = await resolveIdentity();
  const wait = await enforce([[`forget:subject:${identity.key}`, 30, 60]]);
  if (wait > 0) return tooManyRequests(wait);
  await db
    .delete(backtestRuns)
    .where(and(eq(backtestRuns.subjectKey, identity.key), eq(backtestRuns.requestHash, requestHash(body))));
  return new Response(null, { status: 204 });
}
