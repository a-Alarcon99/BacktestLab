"""HTTP-level protections: body size cap, per-IP/global rate limits, security headers."""

import hmac
import math
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import Settings
from app.core.limits import SlidingWindowLimiter, client_ip

limiter = SlidingWindowLimiter()

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    # Served behind HTTPS in production; browsers ignore it over plain HTTP (local dev).
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


class _BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    """Rejects request bodies above `max_bytes`, by Content-Length or by counting streamed bytes."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > self.max_bytes):
            await self._reject(scope, receive, send)
            return

        seen = 0
        started = False

        async def counting_receive() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.max_bytes:
                    raise _BodyTooLarge
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except _BodyTooLarge:
            if not started:
                await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse({"detail": "Request body too large"}, status_code=413)
        await response(scope, receive, send)


def _rule_for(request: Request, s: Settings) -> list[tuple[str, int, float]] | None:
    """(bucket, limit, window seconds) checks for the request; None = not limited."""
    path, method = request.url.path, request.method
    if path == "/health" or method == "OPTIONS":
        return None
    if method == "POST" and path == "/backtests/run":
        return [
            ("bt-min", s.rate_limit_backtest_per_minute, 60),
            ("bt-hour", s.rate_limit_backtest_per_hour, 3600),
        ]
    if path.endswith("/candles"):
        return [("candles", s.rate_limit_candles_per_minute, 60)]
    return [("default", s.rate_limit_default_per_minute, 60)]


def path_is_backtest_run(request: Request) -> bool:
    return request.method == "POST" and request.url.path == "/backtests/run"


def _has_valid_internal_key(request: Request, s: Settings) -> bool:
    given = request.headers.get("x-internal-key")
    return bool(s.internal_api_key and given) and hmac.compare_digest(
        given.encode(), s.internal_api_key.encode()
    )


def make_rate_limit_middleware(
    s: Settings,
) -> Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]:
    async def middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if s.rate_limit_enabled:
            checks = _rule_for(request, s)
            if checks:
                # Backtests only arrive through the web app, which is the one peer here: it
                # authenticates with the internal key and forwards the real client address, so
                # that header is trusted for such calls (otherwise every user shares one bucket).
                # The web app's entry sits one position further left for each proxy in front of
                # us, which append the web app's own address after it.
                hops = s.trusted_proxy_hops
                if path_is_backtest_run(request) and _has_valid_internal_key(request, s):
                    hops += 1
                ip = client_ip(
                    request.client.host if request.client else None,
                    request.headers.get("x-forwarded-for"),
                    hops,
                )
                waits = [limiter.hit(f"{b}:{ip}", n, w) for b, n, w in checks]
                # The global bucket is only charged for requests that passed the per-IP limits.
                if not any(waits) and request.url.path == "/backtests/run":
                    waits.append(
                        limiter.hit("bt-global", s.rate_limit_backtest_global_per_minute, 60)
                    )
                wait = max(waits, default=0.0)
                if wait:
                    return JSONResponse(
                        {"detail": "Too many requests"},
                        status_code=429,
                        headers={"Retry-After": str(math.ceil(wait))},
                    )
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response

    return middleware
