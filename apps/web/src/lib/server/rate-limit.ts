// In-process sliding-window limiter for route handlers. State lives in this server instance only:
// with several instances (or serverless) each keeps its own counters, so the effective limit is
// multiplied by the instance count and resets on deploy. It stops a single client from hammering
// one instance; the edge firewall is the shared layer (see SECURITY.md).

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
export function checkAll(checks: [key: string, limit: number, windowSeconds: number][], l = limiter): number {
  return Math.max(0, ...checks.map(([key, limit, window]) => l.hit(key, limit, window)));
}
