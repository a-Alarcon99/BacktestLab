"""Hot tail of 1m candles in Postgres (`candles_recent_1m`): what R2 doesn't have yet.

R2 gets whole days from the daily ingest (`app.ingest`), so it lags up to a day behind. This tail
covers `assets.candles_until` .. now, filled from Binance's REST API by `python -m app.sync` (or
the warm-up). Rows older than `candles_until` are redundant and removed.
"""

from datetime import UTC, datetime, timedelta

from psycopg import Connection

from app.core.config import get_settings
from app.services import market_data
from app.services.candles import AssetRef, last_closed_open_time

MINUTE = timedelta(minutes=1)


def sync_recent(conn: Connection, asset: AssetRef) -> None:
    """Download the closed 1m candles missing since `candles_until` (at most a week back)."""
    now = datetime.now(UTC)
    last_closed = last_closed_open_time(now, "1m")
    floor = now - timedelta(hours=get_settings().recent_candles_hours)
    if asset.candles_until is not None:
        floor = max(asset.candles_until, now - timedelta(days=7))
    floor = floor.replace(second=0, microsecond=0)

    (latest,) = conn.execute(
        "select max(open_time) from candles_recent_1m where asset_id = %s", (asset.id,)
    ).fetchone()
    start = max(latest + MINUTE, floor) if latest else floor
    if start <= last_closed:
        for page in market_data.iter_klines(asset.binance_symbol, "1m", MINUTE, start, last_closed):
            conn.cursor().executemany(
                """
                insert into candles_recent_1m (asset_id, open_time, open, high, low, close, volume)
                values (%s, %s, %s, %s, %s, %s, %s)
                on conflict do nothing
                """,
                [(asset.id, k.open_time, k.open, k.high, k.low, k.close, k.volume) for k in page],
            )
    if asset.candles_until is not None:
        conn.execute(
            "delete from candles_recent_1m where asset_id = %s and open_time < %s",
            (asset.id, asset.candles_until),
        )
    conn.commit()
