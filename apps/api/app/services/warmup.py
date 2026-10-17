"""Keeps market data warm so the first visitor after a quiet period doesn't wait for providers.

Triggered by `/health` (pinged on a schedule, see DEPLOY.md) and throttled in-process, because that
endpoint is public and exempt from rate limiting.
"""

import logging
import threading
import time
from datetime import UTC, datetime

from app.core import db
from app.core.config import get_settings
from app.services.candles import HOUR, AssetRef, ensure_candles
from app.services.quotes import refresh_quotes

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_last_run: float | None = None


def _due() -> bool:
    global _last_run
    with _lock:
        now = time.monotonic()
        if _last_run is not None and now - _last_run < get_settings().warmup_min_interval_seconds:
            return False
        _last_run = now
        return True


def warm_market_data() -> None:
    """Refresh quotes and top up the stored candles. Never raises: it runs after the response."""
    if not _due():
        return
    try:
        with db.connection() as conn:
            refresh_quotes(conn)
            # Only assets somebody already charted: their stored range just gets extended to now,
            # so nothing new is downloaded for assets nobody looks at.
            assets = [
                AssetRef(*row)
                for row in conn.execute(
                    """
                    select a.id, a.binance_symbol, a.history_since from assets a
                    where a.is_active
                      and exists (select 1 from candles_1h c where c.asset_id = a.id)
                    order by a.id
                    """
                ).fetchall()
            ]
            conn.commit()
            for asset in assets:
                try:
                    now = datetime.now(UTC)
                    ensure_candles(conn, asset, now - 2 * HOUR, now)
                except Exception:
                    conn.rollback()
                    logger.exception("Candle warm-up failed for asset %s", asset.id)
    except Exception:
        logger.exception("Market data warm-up failed")
