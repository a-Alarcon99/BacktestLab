"""Candle reader: Parquet history in R2 plus a hot tail in Postgres, resampled to any timeframe.

Only three base timeframes are stored (1m, 15m, 1h, see `candle_store`); every other timeframe is
resampled from the largest base that divides it, which keeps reads small (a 1d backtest never
touches 1m data). R2 holds whole UTC days up to `assets.candles_until` (exclusive); from there to
now the last closed 1m candles come from `candles_recent_1m`. The API never downloads candles.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal, get_args

import pandas as pd
from psycopg import Connection

from app.services.candle_store import OHLCV, BaseTimeframe, Store, get_store, read_candles

logger = logging.getLogger(__name__)

Timeframe = Literal["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"]
TIMEFRAMES: tuple[Timeframe, ...] = get_args(Timeframe)

MIN_RANGE = timedelta(days=1)

# Stored timeframe each one is built from.
BASE_FOR: dict[Timeframe, BaseTimeframe] = {
    "1m": "1m",
    "3m": "1m",
    "5m": "1m",
    "15m": "15m",
    "30m": "15m",
    "1h": "1h",
    "2h": "1h",
    "4h": "1h",
    "1d": "1h",
    "1w": "1h",
    "1M": "1h",
}
BASE_STEP: dict[BaseTimeframe, timedelta] = {
    "1m": timedelta(minutes=1),
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
}
# pandas resample rules matching Binance's UTC candle boundaries (weeks start on Monday).
TIMEFRAME_RULES: dict[Timeframe, str] = {
    "1m": "1min",
    "3m": "3min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "1d": "1D",
    "1w": "W-MON",
    "1M": "MS",
}
# Upper bound of each candle's duration.
TIMEFRAME_SPAN: dict[Timeframe, timedelta] = {
    "1m": timedelta(minutes=1),
    "3m": timedelta(minutes=3),
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "30m": timedelta(minutes=30),
    "1h": timedelta(hours=1),
    "2h": timedelta(hours=2),
    "4h": timedelta(hours=4),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
    "1M": timedelta(days=31),
}
# Timeframes aligned to the clock: candle opens are multiples of this many minutes since 00:00 UTC.
_CLOCK_MINUTES = {"1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "2h": 120, "4h": 240}
_OHLCV = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}


class InvalidRangeError(ValueError):
    pass


@dataclass(frozen=True)
class AssetRef:
    id: int
    binance_symbol: str
    history_since: date
    candles_until: datetime | None = None  # exclusive end of the history stored in R2


def get_asset_ref(conn: Connection, symbol: str) -> AssetRef | None:
    """Active asset by symbol (case-insensitive)."""
    row = conn.execute(
        """
        select id, binance_symbol, history_since, candles_until
        from assets where is_active and symbol = upper(%s)
        """,
        (symbol,),
    ).fetchone()
    return AssetRef(*row) if row else None


def last_closed_open_time(now: datetime, base: BaseTimeframe = "1h") -> datetime:
    """Open time of the most recent fully closed candle of a base timeframe."""
    return period_start(now, base) - BASE_STEP[base]


def period_start(ts: datetime, timeframe: Timeframe) -> datetime:
    ts = ts.astimezone(UTC)
    day = ts.replace(hour=0, minute=0, second=0, microsecond=0)
    if timeframe in _CLOCK_MINUTES:
        minutes = _CLOCK_MINUTES[timeframe]
        minute_of_day = ts.hour * 60 + ts.minute
        return day + timedelta(minutes=minute_of_day - minute_of_day % minutes)
    match timeframe:
        case "1d":
            return day
        case "1w":
            return day - timedelta(days=day.weekday())
        case "1M":
            return day.replace(day=1)
    raise ValueError(timeframe)


def older_window(
    before: datetime, timeframe: Timeframe, limit: int, history_start: datetime
) -> tuple[datetime, datetime] | None:
    """Range (inclusive open times) of roughly `limit` candles that precede the candle at `before`.

    `before` must be a candle open time of `timeframe`, so the window ends on a period boundary.
    Returns None when `before` is already at the start of the asset's history.
    """
    end = before - BASE_STEP[BASE_FOR[timeframe]]
    start = max(period_start(before - limit * TIMEFRAME_SPAN[timeframe], timeframe), history_start)
    if end < start:
        return None
    return min(start, end - MIN_RANGE), end


def resample(
    df: pd.DataFrame, timeframe: Timeframe, until: datetime, source: Timeframe | None = None
) -> pd.DataFrame:
    """Aggregate candles of a finer timeframe (indexed by open_time) into `timeframe`.

    `source` is the timeframe of `df` (default: the base `timeframe` is built from); when equal
    to `timeframe` nothing is aggregated. Periods with no data are dropped, and so is a trailing
    period that ends after `until` (exclusive end of the available data), so the last candle is
    never partial.
    """
    if timeframe != (source or BASE_FOR[timeframe]):
        df = df.resample(TIMEFRAME_RULES[timeframe], closed="left", label="left").agg(_OHLCV)
        df = df.dropna(subset=["open"])
    offset = pd.tseries.frequencies.to_offset(TIMEFRAME_RULES[timeframe])
    return df[(df.index + offset) <= pd.Timestamp(until)]


def _recent_1m(conn: Connection, asset: AssetRef, start: datetime, end: datetime) -> pd.DataFrame:
    rows = conn.execute(
        """
        select open_time, open, high, low, close, volume
        from candles_recent_1m
        where asset_id = %s and open_time >= %s and open_time < %s
        order by open_time
        """,
        (asset.id, start, end),
    ).fetchall()
    df = pd.DataFrame(rows, columns=["open_time", *OHLCV]).set_index("open_time")
    df.index = pd.to_datetime(df.index, utc=True)
    return df


def get_candles(
    conn: Connection,
    asset: AssetRef,
    timeframe: Timeframe,
    start: datetime,
    end: datetime,
    *,
    store: Store | None = None,
) -> pd.DataFrame:
    """Closed candles in `timeframe` covering [start, end], as far as the data reaches.

    History comes from R2 up to `asset.candles_until`; the 1m hot tail in Postgres extends it to
    the last closed minute. If the sync that feeds the tail is not running, the data simply ends
    at `candles_until` (yesterday).
    """
    if end - start < MIN_RANGE:
        raise InvalidRangeError("The range must be at least 1 day")

    base = BASE_FOR[timeframe]
    step = BASE_STEP[base]
    start = period_start(start, timeframe)
    now = datetime.now(UTC)
    until = min(period_start(end, base), last_closed_open_time(now, base)) + step
    stored_until = asset.candles_until

    frames = []
    if stored_until is not None and start < stored_until:
        frames.append(
            read_candles(
                store or get_store(), asset.binance_symbol, base, start, min(until, stored_until)
            )
        )
    if stored_until is None or until > stored_until:
        tail = _recent_1m(conn, asset, max(start, stored_until or start), until)
        if base != "1m":
            # The tail starts on a day boundary, so only its last period can be incomplete.
            tail = resample(tail, base, until, source="1m")
        frames.append(tail)

    frames = [f for f in frames if not f.empty]
    if not frames:
        return pd.DataFrame(columns=OHLCV, index=pd.DatetimeIndex([], tz="UTC", name="open_time"))
    df = pd.concat(frames)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return resample(df, timeframe, until)
