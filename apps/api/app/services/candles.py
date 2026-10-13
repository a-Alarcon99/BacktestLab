"""1h candle store (`candles_1h`) and resampling to higher timeframes.

Only 1h candles are stored. Coverage per asset is kept contiguous by only ever extending it at the
edges, so `min(open_time)`/`max(open_time)` fully describe what is already downloaded.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal, get_args

import pandas as pd
from psycopg import Connection

from app.services import market_data

Timeframe = Literal["1h", "4h", "1d", "1w", "1M"]
TIMEFRAMES: tuple[Timeframe, ...] = get_args(Timeframe)

HOUR = timedelta(hours=1)
MIN_RANGE = timedelta(days=1)

# pandas resample rules matching Binance's UTC candle boundaries (weeks start on Monday).
TIMEFRAME_RULES: dict[Timeframe, str] = {
    "1h": "1h",
    "4h": "4h",
    "1d": "1D",
    "1w": "W-MON",
    "1M": "MS",
}
_OHLCV = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
_CANDLES_LOCK_NAMESPACE = 7_301


class InvalidRangeError(ValueError):
    pass


@dataclass(frozen=True)
class AssetRef:
    id: int
    binance_symbol: str
    history_since: date


def get_asset_ref(conn: Connection, symbol: str) -> AssetRef | None:
    """Active asset by symbol (case-insensitive)."""
    row = conn.execute(
        "select id, binance_symbol, history_since from assets where is_active and symbol = upper(%s)",
        (symbol,),
    ).fetchone()
    return AssetRef(*row) if row else None


def last_closed_open_time(now: datetime) -> datetime:
    """Open time of the most recent fully closed 1h candle."""
    return now.astimezone(UTC).replace(minute=0, second=0, microsecond=0) - HOUR


def period_start(ts: datetime, timeframe: Timeframe) -> datetime:
    ts = ts.astimezone(UTC)
    hour = ts.replace(minute=0, second=0, microsecond=0)
    day = hour.replace(hour=0)
    match timeframe:
        case "1h":
            return hour
        case "4h":
            return hour.replace(hour=hour.hour - hour.hour % 4)
        case "1d":
            return day
        case "1w":
            return day - timedelta(days=day.weekday())
        case "1M":
            return day.replace(day=1)


def missing_ranges(
    start: datetime, end: datetime, stored_min: datetime | None, stored_max: datetime | None
) -> list[tuple[datetime, datetime]]:
    """Ranges (inclusive open times) that must be downloaded to cover [start, end]."""
    if start > end:
        return []
    if stored_min is None or stored_max is None:
        return [(start, end)]
    gaps = []
    if start < stored_min:
        gaps.append((start, stored_min - HOUR))
    if end > stored_max:
        gaps.append((stored_max + HOUR, end))
    return gaps


def ensure_candles(conn: Connection, asset: AssetRef, start: datetime, end: datetime) -> None:
    """Download from Binance whatever part of [start, end] is not stored yet."""
    history_start = datetime.combine(asset.history_since, datetime.min.time(), UTC)
    start = max(period_start(start, "1h"), history_start)
    end = min(period_start(end, "1h"), last_closed_open_time(datetime.now(UTC)))

    # Serialize downloads per asset; a waiting request then finds the data already stored.
    conn.execute("select pg_advisory_xact_lock(%s, %s)", (_CANDLES_LOCK_NAMESPACE, asset.id))
    stored_min, stored_max = conn.execute(
        "select min(open_time), max(open_time) from candles_1h where asset_id = %s", (asset.id,)
    ).fetchone()

    for gap_start, gap_end in missing_ranges(start, end, stored_min, stored_max):
        for page in market_data.iter_klines_1h(asset.binance_symbol, gap_start, gap_end):
            conn.cursor().executemany(
                """
                insert into candles_1h (asset_id, open_time, open, high, low, close, volume)
                values (%s, %s, %s, %s, %s, %s, %s)
                on conflict do nothing
                """,
                [(asset.id, k.open_time, k.open, k.high, k.low, k.close, k.volume) for k in page],
            )
    conn.commit()  # persists the candles and releases the advisory lock


def resample(df: pd.DataFrame, timeframe: Timeframe, until: datetime) -> pd.DataFrame:
    """Aggregate 1h candles (indexed by open_time) into `timeframe`.

    Periods with no data are dropped, and so is a trailing period that ends after `until`
    (exclusive end of the available data), so the last candle is never partial.
    """
    if timeframe != "1h":
        df = df.resample(TIMEFRAME_RULES[timeframe], closed="left", label="left").agg(_OHLCV)
        df = df.dropna(subset=["open"])
    offset = pd.tseries.frequencies.to_offset(TIMEFRAME_RULES[timeframe])
    return df[(df.index + offset) <= pd.Timestamp(until)]


def get_candles(
    conn: Connection, asset: AssetRef, timeframe: Timeframe, start: datetime, end: datetime
) -> pd.DataFrame:
    """Candles in `timeframe` covering [start, end], downloading missing 1h data first."""
    if end - start < MIN_RANGE:
        raise InvalidRangeError("The range must be at least 1 day")

    start = period_start(start, timeframe)
    ensure_candles(conn, asset, start, end)
    until = min(period_start(end, "1h"), last_closed_open_time(datetime.now(UTC))) + HOUR

    rows = conn.execute(
        """
        select open_time, open, high, low, close, volume
        from candles_1h
        where asset_id = %s and open_time >= %s and open_time < %s
        order by open_time
        """,
        (asset.id, start, until),
    ).fetchall()
    df = pd.DataFrame(rows, columns=["open_time", *_OHLCV]).set_index("open_time")
    df.index = pd.to_datetime(df.index, utc=True)
    return resample(df, timeframe, until)
