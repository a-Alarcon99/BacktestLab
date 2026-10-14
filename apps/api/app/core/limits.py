"""In-process abuse controls: sliding-window rate limiter and client IP resolution.

State lives in this process only. With several instances each one enforces its own budget, so
the effective limit is multiplied by the instance count; the edge (WAF / CDN) must provide the
shared layer. See SECURITY.md.
"""

import threading
import time
from collections import deque

# Hard cap on tracked keys, so spoofed/rotating IPs can't grow memory without bound.
MAX_KEYS = 50_000


class SlidingWindowLimiter:
    def __init__(self, max_keys: int = MAX_KEYS) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._max_keys = max_keys

    def hit(self, key: str, limit: int, window_seconds: float, now: float | None = None) -> float:
        """Register an attempt. Returns 0 when allowed, else seconds until it would be."""
        now = time.monotonic() if now is None else now
        with self._lock:
            if key not in self._hits and len(self._hits) >= self._max_keys:
                self._evict(now)
            q = self._hits.setdefault(key, deque())
            cutoff = now - window_seconds
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= limit:
                return max(q[0] + window_seconds - now, 0.001)
            q.append(now)
            return 0.0

    def _evict(self, now: float) -> None:
        # Drop idle keys (last hit older than an hour); if all are active, drop the oldest half.
        stale = [k for k, q in self._hits.items() if not q or q[-1] < now - 3600]
        for k in stale:
            del self._hits[k]
        if len(self._hits) >= self._max_keys:
            by_age = sorted(self._hits, key=lambda k: self._hits[k][-1])
            for k in by_age[: len(by_age) // 2]:
                del self._hits[k]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(peer: str | None, forwarded_for: str | None, trusted_hops: int) -> str:
    """Client address. X-Forwarded-For is only trusted for `trusted_hops` proxies in front of us:
    each proxy appends the address it saw, so the client is `hops` entries from the right."""
    if trusted_hops > 0 and forwarded_for:
        parts = [p.strip() for p in forwarded_for.split(",") if p.strip()]
        if len(parts) >= trusted_hops:
            return parts[-trusted_hops][:64]
    return (peer or "unknown")[:64]
