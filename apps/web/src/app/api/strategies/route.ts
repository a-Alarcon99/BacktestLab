import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { strategies } from "@/db/schema";
import { apiError, limitResponse } from "@/lib/server/http";
import { isSameOrigin, resolveIdentity } from "@/lib/server/identity";
import { createStrategy, LimitError, NameTakenError } from "@/lib/server/quota";
import { parseStrategyDraft, readJson } from "@/lib/server/strategy-input";
import { toStrategy } from "@/lib/server/strategy-row";

export async function GET() {
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
  const body = await readJson(request);
  if (body === undefined) return apiError(400, "bad_request", "Cuerpo no válido.");
  const parsed = parseStrategyDraft(body);
  if (!parsed.ok) return apiError(422, "invalid_strategy", parsed.errors.join(" "), { errors: parsed.errors });

  const identity = await resolveIdentity({ createGuest: true });
  try {
    const row = await createStrategy(identity, parsed.draft);
    return Response.json(toStrategy(row), { status: 201 });
  } catch (error) {
    if (error instanceof LimitError) return limitResponse(error);
    if (error instanceof NameTakenError) return apiError(409, "name_taken", "Ya tienes una estrategia con este nombre.");
    throw error;
  }
}
