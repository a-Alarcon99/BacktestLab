"""HTTP-level protections: body size cap, per-IP/global rate limits, security headers."""

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


def make_rate_limit_middleware(
    s: Settings,
) -> Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]:
    async def middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if s.rate_limit_enabled:
            checks = _rule_for(request, s)
            if checks:
                ip = client_ip(
                    request.client.host if request.client else None,
                    request.headers.get("x-forwarded-for"),
                    s.trusted_proxy_hops,
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
