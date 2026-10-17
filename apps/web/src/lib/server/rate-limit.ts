// Rate limiting for route handlers, in two layers:
// 1. In-process sliding window (always on). State lives in this server instance only: with several
//    instances (or serverless) each keeps its own counters, so the effective limit is multiplied by
//    the instance count and resets on deploy. It is checked first, so a client hammering one
//    instance is stopped without any network call.
// 2. Shared fixed window in Upstash Redis (optional, `UPSTASH_REDIS_REST_URL` + `_TOKEN`): one
//    counter for every instance. If the store is unreachable the request falls back to layer 1
//    (fail open: plan quotas are enforced in Postgres regardless).
// The edge firewall remains the outermost layer (see SECURITY.md).

export type Check = [key: string, limit: number, windowSeconds: number];

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  private readonly maxKeys: number;

  // No parameter property: the tests run this file with Node's type stripping.
  constructor(maxKeys = 50_000) {
    this.maxKeys = maxKeys;
  }

  /** Registers an attempt. Returns 0 when allowed, otherwise the seconds until it would be. */
  hit(key: string, limit: number, windowSeconds: number, now = Date.now() / 1000): number {
    let q = this.hits.get(key);
    if (!q) {
      if (this.hits.size >= this.maxKeys) this.evict(now);
      q = [];
      this.hits.set(key, q);
    }
    const cutoff = now - windowSeconds;
    while (q.length > 0 && q[0] <= cutoff) q.shift();
    if (q.length >= limit) return Math.max(q[0] + windowSeconds - now, 0.001);
    q.push(now);
    return 0;
  }

  private evict(now: number) {
    for (const [k, q] of this.hits) if (q.length === 0 || q[q.length - 1] < now - 3600) this.hits.delete(k);
    if (this.hits.size < this.maxKeys) return;
    // Everything is active: drop the oldest half (Map keeps insertion order).
    let drop = Math.ceil(this.hits.size / 2);
    for (const k of this.hits.keys()) {
      if (drop-- <= 0) break;
      this.hits.delete(k);
    }
  }

  get size() {
    return this.hits.size;
  }
}

const globalForLimiter = globalThis as unknown as { blLimiter?: SlidingWindowLimiter };

/** Shared per-process instance (survives dev hot reloads). */
export const limiter = (globalForLimiter.blLimiter ??= new SlidingWindowLimiter());

/** Checks every `[key, limit, windowSeconds]`; returns the longest wait, 0 if all pass. */
export function checkAll(checks: Check[], l = limiter): number {
  return Math.max(0, ...checks.map(([key, limit, window]) => l.hit(key, limit, window)));
}

/** Per-client check, skipped when the address is unknown (every client would share one bucket). */
export function perClient(name: string, client: string, limit: number, windowSeconds: number): Check[] {
  return client === "unknown" ? [] : [[`${name}:${client}`, limit, windowSeconds]];
}

// One round trip for all the checks of a request: INCR each key, start its window on the first
// hit, and return the longest wait among the exceeded ones (0 = allowed).
const SHARED_SCRIPT = `
local wait = 0
for i, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[i * 2 - 1])
  local window = tonumber(ARGV[i * 2])
  local n = redis.call('INCR', key)
  if n == 1 then redis.call('EXPIRE', key, window) end
  if n > limit then
    local ttl = redis.call('TTL', key)
    if ttl < 0 then
      redis.call('EXPIRE', key, window)
      ttl = window
    end
    if ttl > wait then wait = ttl end
  end
end
return wait`;

const SHARED_TIMEOUT_MS = 1_000;
let warnedShared = false;

type SharedStore = { url: string; token: string };

function sharedStore(): SharedStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

/** Longest wait reported by the shared store; 0 when allowed, unconfigured or unreachable. */
export async function sharedWait(checks: Check[], store = sharedStore(), fetchImpl: typeof fetch = fetch): Promise<number> {
  if (!store || checks.length === 0) return 0;
  const command = [
    "EVAL",
    SHARED_SCRIPT,
    String(checks.length),
    ...checks.map(([key]) => `bl:rl:${key}`),
    ...checks.flatMap(([, limit, window]) => [String(limit), String(Math.max(1, Math.ceil(window)))]),
  ];
  try {
    const res = await fetchImpl(store.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${store.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(SHARED_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { result } = (await res.json()) as { result?: unknown };
    const wait = Number(result);
    return Number.isFinite(wait) && wait > 0 ? wait : 0;
  } catch (error) {
    if (!warnedShared) {
      warnedShared = true;
      console.error("Shared rate limit store unavailable; using the in-process limits only", error);
    }
    return 0;
  }
}

/** In-process checks first, then the shared store. Returns the seconds to wait, 0 if allowed. */
export async function enforce(checks: Check[], l = limiter): Promise<number> {
  const local = checkAll(checks, l);
  if (local > 0) return local;
  return sharedWait(checks);
}

/** 429 with `Retry-After`, in the `{ code, message }` shape the client maps to a message. */
export function tooManyRequests(
  wait: number,
  message = "Demasiadas peticiones. Espera unos segundos.",
  code = "rate_limited",
): Response {
  return Response.json(
    { code, message },
    { status: 429, headers: { "Retry-After": String(Math.ceil(wait)), "Cache-Control": "no-store" } },
  );
}
