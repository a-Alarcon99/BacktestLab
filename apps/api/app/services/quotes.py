"""Lazy refresh of `asset_quotes`: providers are only called when the stored snapshot is stale."""

import logging
import time

import httpx
from psycopg import Connection

from app.core.config import get_settings
from app.services import market_data

logger = logging.getLogger(__name__)

# Arbitrary key for pg_try_advisory_xact_lock, so only one worker refreshes at a time.
_QUOTES_LOCK_ID = 7_301_001
# After a provider failure, wait this long before calling it again (stale data is served meanwhile).
_FAILURE_BACKOFF_SECONDS = 60
_retry_at = {"prices": 0.0, "caps": 0.0}


def _staleness(conn: Connection) -> tuple[bool, bool]:
    settings = get_settings()
    prices_stale, caps_stale = conn.execute(
        """
        select
          coalesce(bool_or(q.price_updated_at is null
            or q.price_updated_at < now() - make_interval(secs => %s)), false),
          -- Caps can only be stored on existing quote rows, so assets without one don't count
          -- (otherwise CoinGecko would be called on every request while they lack a price).
          coalesce(bool_or(q.market_cap_updated_at is null
            or q.market_cap_updated_at < now() - make_interval(secs => %s))
            filter (where q.asset_id is not null), false)
        from assets a
        left join asset_quotes q on q.asset_id = a.id
        where a.is_active
        """,
        (settings.quote_ttl_seconds, settings.market_cap_ttl_seconds),
    ).fetchone()
    now = time.monotonic()
    return prices_stale and now >= _retry_at["prices"], caps_stale and now >= _retry_at["caps"]


def ensure_fresh_quotes(conn: Connection) -> None:
    prices_stale, caps_stale = _staleness(conn)
    if not (prices_stale or caps_stale):
        return

    locked = conn.execute("select pg_try_advisory_xact_lock(%s)", (_QUOTES_LOCK_ID,)).fetchone()[0]
    if not locked:
        return  # another worker is refreshing; serve what is stored
    # Re-check under the lock: another worker may have just committed a refresh.
    prices_stale, caps_stale = _staleness(conn)
    assets = conn.execute(
        "select id, binance_symbol, coingecko_id from assets where is_active order by id"
    ).fetchall()

    if prices_stale:
        _refresh_prices(conn, assets)
        # New quote rows (first refresh) need their market cap in this same pass.
        caps_stale = _staleness(conn)[1]
    if caps_stale:
        _refresh_market_caps(conn, assets)
    conn.commit()  # persists the upserts and releases the advisory lock


def _refresh_prices(conn: Connection, assets: list[tuple[int, str, str]]) -> None:
    symbols = [binance_symbol for _, binance_symbol, _ in assets]
    try:
        day = market_data.fetch_tickers_24h(symbols)
        week = market_data.fetch_tickers_7d(symbols)
    except httpx.HTTPError:
        logger.exception("Binance ticker refresh failed")
        _retry_at["prices"] = time.monotonic() + _FAILURE_BACKOFF_SECONDS
        return

    rows = [
        (asset_id, t.price, t.change_pct, week[s].change_pct, t.high, t.low, t.quote_volume)
        for asset_id, s, _ in assets
        if (t := day.get(s)) and s in week
    ]
    conn.cursor().executemany(
        """
        insert into asset_quotes
          (asset_id, price, change_24h, change_7d, high_24h, low_24h, volume_24h, price_updated_at)
        values (%s, %s, %s, %s, %s, %s, %s, now())
        on conflict (asset_id) do update set
          price = excluded.price,
          change_24h = excluded.change_24h,
          change_7d = excluded.change_7d,
          high_24h = excluded.high_24h,
          low_24h = excluded.low_24h,
          volume_24h = excluded.volume_24h,
          price_updated_at = excluded.price_updated_at
        """,
        rows,
    )


def _refresh_market_caps(conn: Connection, assets: list[tuple[int, str, str]]) -> None:
    try:
        caps = market_data.fetch_market_caps([coingecko_id for _, _, coingecko_id in assets])
    except httpx.HTTPError:
        logger.exception("CoinGecko market cap refresh failed")
        _retry_at["caps"] = time.monotonic() + _FAILURE_BACKOFF_SECONDS
        return

    # Ids CoinGecko doesn't return are still stamped (with nulls), so they don't retrigger a refresh.
    missing = market_data.MarketCap(None, None)
    rows = [
        (c.market_cap, c.rank, asset_id)
        for asset_id, _, coingecko_id in assets
        for c in [caps.get(coingecko_id, missing)]
    ]
    # Only updates rows that already have a price (asset_quotes.price is NOT NULL).
    conn.cursor().executemany(
        """
        update asset_quotes
        set market_cap = %s, market_cap_rank = %s, market_cap_updated_at = now()
        where asset_id = %s
        """,
        rows,
    )
