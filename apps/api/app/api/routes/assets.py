from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection
from psycopg.rows import dict_row

from app.core.db import get_conn
from app.schemas.asset import Asset, Candle
from app.services.candles import AssetRef, Timeframe, get_candles
from app.services.quotes import ensure_fresh_quotes

router = APIRouter(prefix="/assets", tags=["assets"])

# Chart window per timeframe (roughly 100-400 candles). `None` means the whole history of the asset.
CHART_LOOKBACK: dict[Timeframe, timedelta | None] = {
    "1h": timedelta(days=7),
    "4h": timedelta(days=30),
    "1d": timedelta(days=365),
    "1w": timedelta(days=3 * 365),
    "1M": None,
}

_ASSETS_QUERY = """
    select
      a.symbol, a.name, c.name as category, a.history_since,
      q.market_cap_rank as rank, q.price, q.change_24h, q.change_7d, q.volume_24h,
      q.market_cap, q.high_24h, q.low_24h, q.price_updated_at as updated_at
    from assets a
    join categories c on c.id = a.category_id
    left join asset_quotes q on q.asset_id = a.id
    where a.is_active {filter}
    order by q.market_cap_rank nulls last, a.id
"""


def _has_quote(row: dict) -> bool:
    # A missing quote only happens before the first successful refresh from Binance.
    return row["price"] is not None


@router.get("")
def list_assets(conn: Annotated[Connection, Depends(get_conn)]) -> list[Asset]:
    ensure_fresh_quotes(conn)
    rows = conn.cursor(row_factory=dict_row).execute(_ASSETS_QUERY.format(filter="")).fetchall()
    return [Asset.model_validate(row) for row in rows if _has_quote(row)]


@router.get("/{symbol}")
def get_asset(symbol: str, conn: Annotated[Connection, Depends(get_conn)]) -> Asset:
    ensure_fresh_quotes(conn)
    rows = (
        conn.cursor(row_factory=dict_row)
        .execute(_ASSETS_QUERY.format(filter="and a.symbol = upper(%s)"), (symbol,))
        .fetchall()
    )
    if not rows:
        raise HTTPException(404, "Asset not found")
    if not _has_quote(rows[0]):
        raise HTTPException(503, "Market data is not available yet")
    return Asset.model_validate(rows[0])


@router.get("/{symbol}/candles")
def get_asset_candles(
    symbol: str, conn: Annotated[Connection, Depends(get_conn)], timeframe: Timeframe = "4h"
) -> list[Candle]:
    row = conn.execute(
        "select id, binance_symbol, history_since from assets where is_active and symbol = upper(%s)",
        (symbol,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Asset not found")
    asset = AssetRef(*row)

    lookback = CHART_LOOKBACK[timeframe]
    end = datetime.now(UTC)
    start = (
        end - lookback
        if lookback
        else datetime.combine(asset.history_since, datetime.min.time(), UTC)
    )
    df = get_candles(conn, asset, timeframe, start, end)
    return [
        Candle(time=t, open=r.open, high=r.high, low=r.low, close=r.close, volume=r.volume)
        for t, r in zip(df.index.to_pydatetime(), df.itertuples(index=False), strict=True)
    ]
