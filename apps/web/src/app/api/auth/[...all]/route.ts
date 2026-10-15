import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { readLimitedText } from "@/lib/server/body";
import { clientIp } from "@/lib/server/identity";
import { checkAll } from "@/lib/server/rate-limit";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

const MAX_AUTH_BODY_BYTES = 16 * 1024;

type Check = [key: string, limit: number, windowSeconds: number];

/**
 * Limits that apply before Better Auth runs. Its own limiter is keyed on whatever address header
 * it is configured to trust; this one uses the same hop-aware address as the rest of the app and
 * adds global caps, which bound automated account creation and password-hashing CPU (scrypt) even
 * when the attacker spreads over many addresses. Per instance: the edge firewall is the shared layer.
 */
function limitsFor(pathname: string, ip: string): Check[] {
  const perIp = (name: string, limit: number, window: number): Check[] =>
    ip === "unknown" ? [] : [[`auth:${name}:ip:${ip}`, limit, window]];

  if (pathname.endsWith("/sign-up/email"))
    return [...perIp("signup", 5, 3600), ["auth:signup:global", 60, 3600]];
  if (pathname.endsWith("/sign-in/email"))
    return [...perIp("signin", 10, 300), ["auth:signin:global", 600, 300]];
  if (pathname.endsWith("/send-verification-email"))
    return [...perIp("verify", 5, 3600), ["auth:verify:global", 100, 3600]];
  return [...perIp("other", 60, 60), ["auth:other:global", 1200, 60]];
}

export async function POST(request: Request) {
  const wait = checkAll(limitsFor(new URL(request.url).pathname, clientIp(request.headers)));
  if (wait > 0)
    return Response.json(
      { code: "RATE_LIMITED", message: "Demasiados intentos. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait)) } },
    );

  const text = await readLimitedText(request, MAX_AUTH_BODY_BYTES);
  if (text === undefined) return Response.json({ code: "TOO_LARGE", message: "Petición demasiado grande." }, { status: 413 });
  // The body was consumed by the size-capped reader: hand Better Auth an equivalent request.
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return handler.POST(new Request(request.url, { method: "POST", headers, body: text }));
}
