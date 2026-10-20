"""Keeps market data warm so the first visitor after a quiet period doesn't wait for providers.

Triggered by `/health` (pinged on a schedule, see DEPLOY.md) and throttled in-process, because that
endpoint is public and exempt from rate limiting.
"""

import logging
import threading
import time

from app.core import db
from app.core.config import get_settings
from app.services.candles import AssetRef
from app.services.market_data import ProviderBannedError
from app.services.quotes import refresh_quotes
from app.services.recent import sync_recent

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
    if not get_settings().provider_fetch_enabled or not _due():
        return
    try:
        with db.connection() as conn:
            refresh_quotes(conn)
            # Only assets whose R2 history exists: the 1m hot tail is topped up to now.
            assets = [
                AssetRef(*row)
                for row in conn.execute(
                    """
                    select a.id, a.binance_symbol, a.history_since, a.candles_until
                    from assets a
                    where a.is_active and a.candles_until is not null
                    order by a.id
                    """
                ).fetchall()
            ]
            conn.commit()
            for asset in assets:
                try:
                    sync_recent(conn, asset)
                except ProviderBannedError:
                    conn.rollback()
                    logger.warning("Candle warm-up skipped: Binance has banned this IP")
                    break
                except Exception:
                    conn.rollback()
                    logger.exception("Candle warm-up failed for asset %s", asset.id)
    except Exception:
        logger.exception("Market data warm-up failed")
