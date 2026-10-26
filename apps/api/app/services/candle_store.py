"""Candle history as Parquet files: layout, encoding, object storage (R2) and the local disk cache.

    candles/{BINANCE_SYMBOL}/1m/{YYYY}/{YYYY-MM}.parquet   one file per month
    candles/{BINANCE_SYMBOL}/15m/{YYYY}.parquet            one file per year
    candles/{BINANCE_SYMBOL}/1h/{YYYY}.parquet

Only these three "base" timeframes are stored; the rest is resampled (see `services/candles.py`).
Closed months/years never change, so their files are cached on disk forever; the file of the
month/year in progress is downloaded again once the cached copy is older than a few minutes. If
the store cannot be reached, a cached copy of any age is served instead; with none, reads fail
fast with `CandleStoreError` (and stay failed for `STORE_RETRY_SECONDS`, so a batch does not wait
for the timeouts once per asset).
"""

import io
import logging
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import cache
from pathlib import Path
from typing import Literal, Protocol

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BaseTimeframe = Literal["1m", "15m", "1h"]
OHLCV = ["open", "high", "low", "close", "volume"]


class Store(Protocol):
    """Object storage holding the Parquet files."""

    cacheable: bool  # False when reads are already local

    def get(self, key: str) -> bytes | None: ...

    def put(self, key: str, data: bytes) -> None: ...


class LocalStore:
    """Same layout in a local folder (`CANDLE_LOCAL_DIR`): tests, local development, dry runs."""

    cacheable = False

    def __init__(self, root: Path):
        self.root = root

    def get(self, key: str) -> bytes | None:
        path = self.root / key
        return path.read_bytes() if path.exists() else None

    def put(self, key: str, data: bytes) -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


class CandleStoreError(Exception):
    """The candle store could not be reached (network, TLS, credentials) and nothing is cached."""


STORE_RETRY_SECONDS = 30
_down_until = 0.0


class R2Store:
    """Cloudflare R2 through its S3-compatible API."""

    cacheable = True

    def __init__(self, client, bucket: str):
        self.client = client
        self.bucket = bucket

    def get(self, key: str) -> bytes | None:
        global _down_until
        if time.monotonic() < _down_until:
            raise CandleStoreError("Candle storage is unreachable (recent failure)")
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            return None
        except (BotoCoreError, ClientError) as exc:
            _down_until = time.monotonic() + STORE_RETRY_SECONDS
            raise CandleStoreError(f"Candle storage is unreachable: {exc}") from exc

    def put(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)


@cache
def get_store() -> Store:
    s = get_settings()
    if s.r2_endpoint:
        import boto3  # heavy import, only needed when reading from R2
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=s.r2_endpoint,
            aws_access_key_id=s.r2_access_key_id,
            aws_secret_access_key=s.r2_secret_access_key,
            region_name="auto",
            config=Config(
                retries={"max_attempts": 2, "mode": "standard"},
                connect_timeout=5,
                read_timeout=20,
            ),
        )
        return R2Store(client, s.r2_bucket)
    if s.candle_local_dir:
        return LocalStore(Path(s.candle_local_dir))
    raise RuntimeError("Candle storage is not configured: set R2_ENDPOINT or CANDLE_LOCAL_DIR")


# --- Layout ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class FileRef:
    key: str
    start: datetime  # first instant the file covers
    end: datetime  # exclusive; a file that ends in the future is still being written


def _month_start(year: int, month: int) -> datetime:
    return datetime(year, month, 1, tzinfo=UTC)


def file_ref(symbol: str, base: BaseTimeframe, year: int, month: int = 1) -> FileRef:
    """The file of `base` candles that holds the given month (1m) or year (15m, 1h)."""
    if base == "1m":
        end = _month_start(year + month // 12, month % 12 + 1)
        return FileRef(
            f"candles/{symbol}/1m/{year}/{year}-{month:02d}.parquet", _month_start(year, month), end
        )
    return FileRef(
        f"candles/{symbol}/{base}/{year}.parquet", _month_start(year, 1), _month_start(year + 1, 1)
    )


def file_refs(symbol: str, base: BaseTimeframe, start: datetime, end: datetime) -> list[FileRef]:
    """Files that can hold candles opening in [start, end)."""
    start, end = start.astimezone(UTC), end.astimezone(UTC)
    refs, year, month = [], start.year, start.month
    while _month_start(year, month) < end:
        ref = file_ref(symbol, base, year, month)
        if not refs or refs[-1].key != ref.key:
            refs.append(ref)
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return refs


# --- Encoding -------------------------------------------------------------------------------


def encode(df: pd.DataFrame) -> bytes:
    """Parquet bytes of candles indexed by UTC open time. Delta-coded times, split float bytes."""
    times = df.index.tz_convert("UTC").tz_localize(None).to_numpy().astype("datetime64[ms]")
    table = pa.table(
        {"open_time": pa.array(times, type=pa.timestamp("ms", tz="UTC"))}
        | {c: pa.array(df[c].to_numpy(dtype="float64")) for c in OHLCV}
    )
    buf = io.BytesIO()
    pq.write_table(
        table,
        buf,
        compression="zstd",
        compression_level=9,
        use_dictionary=False,
        column_encoding={"open_time": "DELTA_BINARY_PACKED"}
        | dict.fromkeys(OHLCV, "BYTE_STREAM_SPLIT"),
    )
    return buf.getvalue()


def decode(data: bytes) -> pd.DataFrame:
    df = pq.read_table(io.BytesIO(data)).to_pandas()
    df["open_time"] = pd.to_datetime(df["open_time"], utc=True)
    return df.set_index("open_time")[OHLCV]


# --- Disk cache -----------------------------------------------------------------------------

_cache_lock = threading.Lock()


def _prune_cache(root: Path, max_bytes: int) -> None:
    files = [(p, p.stat()) for p in root.rglob("*.parquet")]
    total = sum(st.st_size for _, st in files)
    for path, st in sorted(files, key=lambda f: f[1].st_mtime):  # least recently used first
        if total <= max_bytes:
            break
        path.unlink(missing_ok=True)
        total -= st.st_size


def read_file(store: Store, ref: FileRef) -> bytes | None:
    """The file's bytes (None if it doesn't exist), through the disk cache for a remote store."""
    if not store.cacheable:
        return store.get(ref.key)
    s = get_settings()
    path = Path(s.candle_cache_dir) / ref.key
    try:
        if path.exists():
            mtime = path.stat().st_mtime
            # Final only if it was downloaded after its period ended; else it may miss the tail.
            final = mtime >= ref.end.timestamp()
            if final or time.time() - mtime < s.candle_open_file_ttl_seconds:
                return path.read_bytes()
    except OSError:
        logger.warning("Unreadable candle cache entry %s", path, exc_info=True)
    try:
        data = store.get(ref.key)
    except CandleStoreError:
        try:
            stale = path.read_bytes()  # old, but only misses the newest candles
        except OSError:
            raise CandleStoreError("Candle storage is unreachable and nothing is cached") from None
        logger.warning("Candle storage unreachable, serving the cached copy of %s", ref.key)
        return stale
    if data is None:
        return None
    try:
        with _cache_lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
            _prune_cache(Path(s.candle_cache_dir), s.candle_cache_max_mb * 1_000_000)
    except OSError:
        logger.warning("Candle cache is not writable", exc_info=True)
    return data


def read_candles(
    store: Store, symbol: str, base: BaseTimeframe, start: datetime, end: datetime
) -> pd.DataFrame:
    """Stored `base` candles opening in [start, end); empty when no file covers the range."""
    frames = []
    for ref in file_refs(symbol, base, start, end):
        data = read_file(store, ref)
        if data is not None:
            frames.append(decode(data))
    if not frames:
        return pd.DataFrame(columns=OHLCV, index=pd.DatetimeIndex([], tz="UTC", name="open_time"))
    df = pd.concat(frames)
    return df[(df.index >= pd.Timestamp(start)) & (df.index < pd.Timestamp(end))]
