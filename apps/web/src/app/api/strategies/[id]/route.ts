import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { strategies } from "@/db/schema";
import { apiError } from "@/lib/server/http";
import { clientIp, isSameOrigin, resolveIdentity, type Identity } from "@/lib/server/identity";
import { isUniqueViolation } from "@/lib/server/quota";
import { enforce, perClient, tooManyRequests } from "@/lib/server/rate-limit";
import { parseStrategyDraft, readJson } from "@/lib/server/strategy-input";
import { toStrategy } from "@/lib/server/strategy-row";

export const maxDuration = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Edits and deletes consume no quota, so they share the write caps of `POST /api/strategies`.
const throttleClient = (request: Request) =>
  enforce([
    ...perClient("strategies:write:ip", clientIp(request.headers), 30, 60),
    ["strategies:write:global", 600, 60],
  ]);
const throttleSubject = (identity: Identity) => enforce([[`strategies:write:subject:${identity.key}`, 30, 60]]);

/** Editing never consumes quota: only creating counts. */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Origen no permitido.");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return apiError(404, "not_found", "Estrategia no encontrada.");
  const preWait = await throttleClient(request);
  if (preWait > 0) return tooManyRequests(preWait);
  const body = await readJson(request);
  if (body === undefined) return apiError(400, "bad_request", "Cuerpo no válido.");
  const parsed = parseStrategyDraft(body);
  if (!parsed.ok) return apiError(422, "invalid_strategy", parsed.errors.join(" "), { errors: parsed.errors });

  const identity = await resolveIdentity();
  const wait = await throttleSubject(identity);
  if (wait > 0) return tooManyRequests(wait);
  const { name, ...data } = parsed.draft;
  try {
    const [row] = await db
      .update(strategies)
      .set({ name, data, updatedAt: new Date() })
      .where(and(eq(strategies.id, id), eq(strategies.ownerKey, identity.key)))
      .returning();
    if (!row) return apiError(404, "not_found", "Estrategia no encontrada.");
    return Response.json(toStrategy(row));
  } catch (error) {
    if (isUniqueViolation(error)) return apiError(409, "name_taken", "Ya tienes una estrategia con este nombre.");
    throw error;
  }
}

/** Deleting frees the row, never the quota: the usage counters are untouched. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Origen no permitido.");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return apiError(404, "not_found", "Estrategia no encontrada.");
  const preWait = await throttleClient(request);
  if (preWait > 0) return tooManyRequests(preWait);
  const identity = await resolveIdentity();
  const wait = await throttleSubject(identity);
  if (wait > 0) return tooManyRequests(wait);
  await db.delete(strategies).where(and(eq(strategies.id, id), eq(strategies.ownerKey, identity.key)));
  return new Response(null, { status: 204 });
}
