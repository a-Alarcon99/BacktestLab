import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { strategies } from "@/db/schema";
import { apiError, limitResponse } from "@/lib/server/http";
import { clientIp, isSameOrigin, resolveIdentity } from "@/lib/server/identity";
import { createStrategy, LimitError, NameTakenError } from "@/lib/server/quota";
import { enforce, perClient, tooManyRequests } from "@/lib/server/rate-limit";
import { parseStrategyDraft, readJson } from "@/lib/server/strategy-input";
import { toStrategy } from "@/lib/server/strategy-row";

export const maxDuration = 10;

export async function GET(request: Request) {
  const wait = await enforce([
    ...perClient("strategies:read:ip", clientIp(request.headers), 60, 60),
    ["strategies:read:global", 3000, 60],
  ]);
  if (wait > 0) return tooManyRequests(wait);
  const identity = await resolveIdentity();
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.ownerKey, identity.key))
    .orderBy(desc(strategies.updatedAt));
  return Response.json(rows.map(toStrategy), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Origen no permitido.");
  // Rejected creations (invalid, name taken, over quota) consume no quota, so they are capped here.
  const preWait = await enforce([
    ...perClient("strategies:write:ip", clientIp(request.headers), 30, 60),
    ["strategies:write:global", 600, 60],
  ]);
  if (preWait > 0) return tooManyRequests(preWait);
  const body = await readJson(request);
  if (body === undefined) return apiError(400, "bad_request", "Cuerpo no válido.");
  const parsed = parseStrategyDraft(body);
  if (!parsed.ok) return apiError(422, "invalid_strategy", parsed.errors.join(" "), { errors: parsed.errors });

  const identity = await resolveIdentity({ createGuest: true });
  const wait = await enforce([[`strategies:write:subject:${identity.key}`, 30, 60]]);
  if (wait > 0) return tooManyRequests(wait);
  try {
    const row = await createStrategy(identity, parsed.draft);
    return Response.json(toStrategy(row), { status: 201 });
  } catch (error) {
    if (error instanceof LimitError) return limitResponse(error);
    if (error instanceof NameTakenError) return apiError(409, "name_taken", "Ya tienes una estrategia con este nombre.");
    throw error;
  }
}
