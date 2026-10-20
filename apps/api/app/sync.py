"""Market data sync, for a machine whose IP Binance doesn't ban (e.g. your own PC).

Started and stopped by hand (see docs/12-sincronizacion-local.md):

    cd apps/api
    .venv\\Scripts\\python -m app.sync      # Ctrl+C stops it

It writes to the database the deployed API reads, through the API's own functions, so while it runs
the API finds fresh data and doesn't call the providers itself:
- quotes (`refresh_quotes`) whenever they are older than `QUOTE_TTL_SECONDS`;
- the 1m hot tail (`candles_recent_1m`: from the R2 history's end to now) of every asset, once per
  newly closed minute. The long history is not here: `python -m app.ingest daily` puts it in R2.
Stopping it mid-download is safe: each asset's candles are committed in one transaction.
"""

import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import IO

from psycopg import Connection

from app.core import db
from app.core.config import get_settings
from app.services.candles import AssetRef, last_closed_open_time
from app.services.market_data import ProviderBannedError
from app.services.quotes import refresh_quotes
from app.services.recent import sync_recent

logger = logging.getLogger("app.sync")

LOG_DIR = Path("logs")
# After a failed candle round, wait this long before the next one (quotes keep their own pace).
CANDLES_RETRY_SECONDS = 60


@dataclass
class SyncState:
    candles_minute: datetime | None = None  # last closed minute whose candles are all stored
    candles_retry_at: float = 0.0  # monotonic


def sync_candles(conn: Connection) -> bool:
    """Top up the 1m hot tail of each active asset up to the last closed minute.

    False when some asset failed, so the caller tries the round again later.
    """
    assets = [
        AssetRef(*row)
        for row in conn.execute(
            """
            select id, binance_symbol, history_since, candles_until
            from assets where is_active order by id
            """
        ).fetchall()
    ]
    conn.commit()
    ok = True
    for asset in assets:
        try:
            sync_recent(conn, asset)
        except ProviderBannedError:
            conn.rollback()
            logger.warning("Binance has banned this IP: candles wait for the ban to end")
            return False
        except Exception:
            conn.rollback()
            logger.exception("Candle sync failed for %s", asset.binance_symbol)
            ok = False
    return ok


def sync_step(state: SyncState) -> None:
    """One round: quotes if stale, candles once per newly closed minute."""
    with db.connection() as conn:
        refresh_quotes(conn)  # provider failures are logged and backed off inside
        conn.commit()

        minute = last_closed_open_time(datetime.now(UTC), "1m")
        if minute == state.candles_minute or time.monotonic() < state.candles_retry_at:
            return
        if sync_candles(conn):
            state.candles_minute = minute
        else:
            state.candles_retry_at = time.monotonic() + CANDLES_RETRY_SECONDS


def _single_instance_lock(path: Path) -> IO[str] | None:
    """An OS file lock, released by the OS even if the process dies; None if already held."""
    f = path.open("a+")
    try:
        if os.name == "nt":
            import msvcrt

            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def _setup_logging() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    file = RotatingFileHandler(
        LOG_DIR / "sync.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
    )
    console = logging.StreamHandler()
    for handler in (file, console):
        handler.setFormatter(fmt)
    logging.basicConfig(level=logging.INFO, handlers=[file, console])
    logging.getLogger("httpx").setLevel(logging.WARNING)  # one INFO line per request otherwise


def main() -> int:
    _setup_logging()
    settings = get_settings()
    if not settings.provider_fetch_enabled:
        logger.error("PROVIDER_FETCH_ENABLED is false here: the sync has nothing to call")
        return 1
    lock = _single_instance_lock(LOG_DIR / "sync.lock")
    if lock is None:
        logger.error("Another sync is already running on this machine")
        return 1

    db.pool.open()
    state = SyncState()
    logger.info("Sync running every %s s. Ctrl+C to stop.", settings.sync_interval_seconds)
    try:
        while True:
            try:
                sync_step(state)
            except Exception:  # e.g. database unreachable: keep going, next round retries
                logger.exception("Sync round failed")
            time.sleep(settings.sync_interval_seconds)
    except KeyboardInterrupt:
        logger.info("Sync stopped")
    finally:
        db.pool.close()
        lock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
