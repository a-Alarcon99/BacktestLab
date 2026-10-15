"""Caller authentication for endpoints that only the web app may use."""

import hmac
from typing import Annotated

from fastapi import Header, HTTPException

from app.core.config import get_settings

MIN_KEY_LENGTH = 16


def require_internal_key(
    x_internal_key: Annotated[str | None, Header()] = None,
) -> None:
    """Rejects requests without the shared secret the web app adds after checking the user's quota."""
    expected = get_settings().internal_api_key
    # A short key is guessable and `X-Internal-Key` is the only thing between the internet and
    # the engine's CPU, so it counts as not configured.
    if not expected or len(expected) < MIN_KEY_LENGTH:
        raise HTTPException(503, "Backtest engine is not configured")
    given = (x_internal_key or "").encode()
    if not hmac.compare_digest(given, expected.encode()):
        raise HTTPException(401, "Unauthorized")
