import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { db } from "@/db";
import { plans, userPlans } from "@/db/schema";
import { auth } from "@/lib/auth";

// Who is calling, and under which plan. Accounts come from the Better Auth session; anonymous
// visitors get an HMAC-signed, httpOnly guest cookie plus an IP bucket: the cookie alone can be
// dropped by the client, so the IP bucket backs it up on the server.

export const GUEST_COOKIE = "bl_guest";
const GUEST_MAX_AGE = 60 * 60 * 24 * 400;
export const DEFAULT_USER_PLAN = "free";
export const GUEST_PLAN = "guest";

export type Plan = typeof plans.$inferSelect;

export type Identity = {
  kind: "user" | "guest";
  /** Subject key owning strategies and usage: `u:<userId>` or `g:<guestId>`. */
  key: string;
  /** Extra usage bucket shared by every guest behind the same IP (guests only). */
  ipKey?: string;
  user?: { id: string; name: string; email: string };
  plan: Plan;
};

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 16) throw new Error("BETTER_AUTH_SECRET is not configured");
  return value;
}

const mac = (label: string, value: string) =>
  createHmac("sha256", secret()).update(`${label}:${value}`).digest("base64url");

function verifyGuestCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, sig, extra] = raw.split(".");
  if (!id || !sig || extra !== undefined || id.length > 64) return null;
  const expected = Buffer.from(mac("guest", id));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** Client address. `X-Forwarded-For` is only honoured behind `TRUSTED_PROXY_HOPS` proxies. */
export function clientIp(h: Headers): string {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  const forwarded = h.get("x-forwarded-for");
  if (hops > 0 && forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= hops) return parts[parts.length - hops].slice(0, 64);
  }
  return "unknown";
}

/** Same-origin guard for state-changing requests (cookies are SameSite=Lax; defence in depth). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  const allowed = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  try {
    const host = new URL(origin).host;
    return allowed ? host === new URL(allowed).host : host === request.headers.get("host");
  } catch {
    return false;
  }
}

async function loadPlan(id: string): Promise<Plan> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  if (!plan) throw new Error(`Plan "${id}" is not configured (run db:migrate)`);
  return plan;
}

/** Id of the validly signed guest cookie, if any (also present after the guest signs in). */
export async function readGuestId(): Promise<string | null> {
  return verifyGuestCookie((await cookies()).get(GUEST_COOKIE)?.value);
}

/**
 * Resolves the caller. With `createGuest`, an anonymous caller without a valid cookie gets a new
 * one (route handlers only); otherwise it is reported as a guest without persisting anything.
 */
export async function resolveIdentity(options: { createGuest?: boolean } = {}): Promise<Identity> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (session) {
    const [row] = await db
      .select({ planId: userPlans.planId })
      .from(userPlans)
      .where(eq(userPlans.userId, session.user.id))
      .limit(1);
    return {
      kind: "user",
      key: `u:${session.user.id}`,
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      plan: await loadPlan(row?.planId ?? DEFAULT_USER_PLAN),
    };
  }

  const jar = await cookies();
  let guestId = await readGuestId();
  if (!guestId && options.createGuest) {
    guestId = randomBytes(24).toString("base64url");
    jar.set(GUEST_COOKIE, `${guestId}.${mac("guest", guestId)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GUEST_MAX_AGE,
    });
  }
  return {
    kind: "guest",
    // Without a cookie nothing can be stored under it yet; the IP bucket still applies.
    key: `g:${guestId ?? "none"}`,
    ipKey: `ip:${mac("ip", clientIp(h))}`,
    plan: await loadPlan(GUEST_PLAN),
  };
}

/** Subject keys charged for one operation, with the multiplier applied to the plan limit. */
export function subjectsOf(identity: Identity): { key: string; multiplier: number }[] {
  const subjects = [{ key: identity.key, multiplier: 1 }];
  const share = identity.plan.ipShareMultiplier;
  if (identity.ipKey && share) subjects.push({ key: identity.ipKey, multiplier: share });
  return subjects;
}
