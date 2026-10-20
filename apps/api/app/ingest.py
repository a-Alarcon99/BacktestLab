r"""Loads the candle history from data.binance.vision into Parquet files (R2).

    cd apps/api
    .venv\Scripts\python -m app.ingest backfill [SYMBOL]   # whole history; resumes where it stopped
    .venv\Scripts\python -m app.ingest daily [SYMBOL]      # days missing up to yesterday
    .venv\Scripts\python -m app.ingest verify SYMBOL       # compare R2's 1h with the old candles_1h

SYMBOL is an asset symbol (BTC) or its Binance pair (BTCUSDT); no symbol = every active asset.
data.binance.vision is a static CDN (not the REST API Binance bans Render's IP on), so this runs
from GitHub Actions (`.github/workflows/candles-daily.yml`) or from your PC.

Per asset it builds the 1m files from Binance's monthly zips (daily ones for the month in
progress), derives the 15m and 1h files, uploads them and only then moves `assets.candles_until`
forward, so readers never see a day that isn't completely uploaded. Everything is idempotent.
If a daily zip is not published yet the run stops there and the next run continues from it.
"""

import argparse
import hashlib
import io
import logging
import sys
import time
import zipfile
from datetime import UTC, date, datetime, timedelta

import httpx
import pandas as pd

from app.core import db
from app.core.config import get_settings
from app.services.candle_store import (
    OHLCV,
    BaseTimeframe,
    Store,
    decode,
    encode,
    file_ref,
    get_store,
    read_candles,
)
from app.services.candles import resample

logger = logging.getLogger("app.ingest")

_COLUMNS = ["open_time", *OHLCV]
MINUTE = timedelta(minutes=1)
_RETRIES = 3


# --- data.binance.vision --------------------------------------------------------------------


def vision_url(kind: str, symbol: str, period: str) -> str:
    """`kind` is "monthly" (period YYYY-MM) or "daily" (YYYY-MM-DD)."""
    base = get_settings().binance_vision_url
    return f"{base}/data/spot/{kind}/klines/{symbol}/1m/{symbol}-1m-{period}.zip"


def _get(client: httpx.Client, url: str) -> bytes | None:
    """Body of the URL, None on 404; retries server errors and dropped connections."""
    for attempt in range(_RETRIES + 1):
        try:
            res = client.get(url)
        except httpx.TransportError:
            if attempt == _RETRIES:
                raise
        else:
            if res.status_code == 404:
                return None
            if res.status_code < 500:
                res.raise_for_status()
                return res.content
            if attempt == _RETRIES:
                res.raise_for_status()
        time.sleep(2**attempt)
    raise AssertionError("unreachable")


def fetch_zip(client: httpx.Client, kind: str, symbol: str, period: str) -> bytes | None:
    """The zip verified against its published SHA256; None if it isn't published (yet)."""
    url = vision_url(kind, symbol, period)
    data = _get(client, url)
    if data is None:
        return None
    checksum = _get(client, url + ".CHECKSUM")
    if checksum is None:
        raise ValueError(f"{url} has no .CHECKSUM")
    expected = checksum.decode().split()[0].lower()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Checksum mismatch for {url}")
    return data


def parse_klines(zip_bytes: bytes) -> pd.DataFrame:
    """1m candles of a Binance zip, indexed by UTC open time.

    CSVs may or may not have a header row, and since 2025-01-01 spot timestamps are in
    microseconds instead of milliseconds.
    """
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        raw = z.read(z.namelist()[0])
    df = pd.read_csv(io.BytesIO(raw), header=None, usecols=range(6), names=_COLUMNS, dtype=str)
    df["open_time"] = pd.to_numeric(df["open_time"], errors="coerce")
    df = df.dropna(subset=["open_time"])  # drops the header row
    millis = df["open_time"].astype("int64")
    millis = millis.where(millis < 10**14, millis // 1000)
    out = df[OHLCV].astype("float64")
    out.index = pd.DatetimeIndex(pd.to_datetime(millis, unit="ms", utc=True), name="open_time")
    return out[~out.index.duplicated(keep="last")].sort_index()


# --- Parquet files --------------------------------------------------------------------------


def _merge_into(store: Store, key: str, new: pd.DataFrame) -> None:
    """Writes `new` into the file at `key`; its candles replace those with the same open time."""
    data = store.get(key)
    merged = pd.concat([decode(data), new]) if data is not None else new
    merged = merged[~merged.index.duplicated(keep="last")].sort_index()
    store.put(key, encode(merged))


def write_candles(store: Store, symbol: str, minutes: pd.DataFrame) -> None:
    """Stores 1m candles of whole UTC days of one month, and the 15m and 1h derived from them."""
    first, last = minutes.index[0], minutes.index[-1]
    _merge_into(store, file_ref(symbol, "1m", first.year, first.month).key, minutes)
    until = last + MINUTE
    for base in ("15m", "1h"):
        derived = resample(minutes, base, until, source="1m")
        if not derived.empty:
            _merge_into(store, file_ref(symbol, base, first.year).key, derived)


def ingest_days(
    store: Store,
    client: httpx.Client,
    symbol: str,
    start: date,
    end: date,
    *,
    monthly_from_start: bool = False,
) -> date:
    """Ingest the days in [start, end) and return the first one not ingested.

    Uses the monthly zip for a whole month (falling back to daily zips while it isn't published)
    and daily zips otherwise. `monthly_from_start` also takes the monthly zip when `start` is
    mid-month: the first month of an asset, whose zip begins on its first candle. Stops at the
    first day Binance hasn't published.
    """
    day = start
    while day < end:
        month_start = day.replace(day=1)
        next_month = (month_start + timedelta(days=32)).replace(day=1)
        stop = min(next_month, end)
        if next_month <= end and (day == month_start or (monthly_from_start and day == start)):
            zipped = fetch_zip(client, "monthly", symbol, f"{day:%Y-%m}")
            if zipped is not None:
                write_candles(store, symbol, parse_klines(zipped))
                logger.info("%s %s (monthly)", symbol, f"{day:%Y-%m}")
                day = next_month
                continue
        frames, d = [], day
        while d < stop:
            zipped = fetch_zip(client, "daily", symbol, d.isoformat())
            if zipped is None:
                break
            frames.append(parse_klines(zipped))
            d += timedelta(days=1)
        if frames:
            write_candles(store, symbol, pd.concat(frames))
            logger.info("%s %s .. %s (daily)", symbol, day, d - timedelta(days=1))
        day = d
        if d < stop:
            break
    return day


# --- Assets ---------------------------------------------------------------------------------


def _assets(conn, symbol: str | None):
    where = "and (symbol = upper(%(s)s) or binance_symbol = upper(%(s)s))" if symbol else ""
    return conn.execute(
        f"""
        select id, symbol, binance_symbol, history_since, candles_until
        from assets where is_active {where} order by id
        """,
        {"s": symbol},
    ).fetchall()


def _midnight(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


def run(command: str, symbol: str | None) -> int:
    store, today, failed = get_store(), datetime.now(UTC).date(), False
    with db.connection() as conn, httpx.Client(timeout=60, follow_redirects=True) as client:
        assets = _assets(conn, symbol)
        conn.commit()
        if not assets:
            logger.error("No active asset matches %r", symbol)
            return 1
        for asset_id, _, pair, history_since, until in assets:
            if command == "daily" and until is None:
                logger.warning("%s has no history in R2 yet: run `backfill` first", pair)
                failed = True
                continue
            start = until.date() if until else history_since
            try:
                done = ingest_days(
                    store, client, pair, start, today, monthly_from_start=until is None
                )
            except Exception:
                logger.exception("Ingest failed for %s", pair)
                failed = True
                continue
            if done > start:
                # Only after the files are uploaded; a `candles_until` never goes backwards.
                conn.execute(
                    """
                    update assets set candles_until = greatest(candles_until, %s) where id = %s
                    """,
                    (_midnight(done), asset_id),
                )
                conn.commit()
            if done < today:
                logger.warning("%s: data.binance.vision has nothing yet for %s", pair, done)
    return 1 if failed else 0


# --- Verification ---------------------------------------------------------------------------


# Before this date Binance's 1m archive differs from its REST 1h candles (the first minute's open
# is not the hour's open, minutes are missing), so those hours are reported but never fail.
STRICT_FROM = pd.Timestamp("2019-01-01", tz="UTC")
# Share of compared hours since STRICT_FROM that may differ (gaps of a few minutes in the archive).
MAX_RECENT_MISMATCH_RATIO = 0.002


def compare_1h(stored: pd.DataFrame, reference: pd.DataFrame) -> dict[str, float | int]:
    """How the 1h candles derived from 1m differ from the ones Binance's API gave (`reference`).

    Only the range `reference` covers is compared: it may end earlier than R2 (the old sync lags).
    """
    stored = stored[stored.index <= reference.index.max()]
    both = stored.index.intersection(reference.index)
    a, b = stored.loc[both], reference.loc[both]
    rel = (a[OHLCV] - b[OHLCV]).abs() / b[OHLCV].abs().clip(lower=1e-12)
    differs = (rel[OHLCV[:4]] > 1e-9).any(axis=1) | (rel["volume"] > 1e-6)
    recent = both >= STRICT_FROM
    recent_mismatches = int(differs[recent].sum())
    only_pg = reference.index.difference(stored.index)
    return {
        "compared": len(both),
        "mismatches_before_2019": int(differs[~recent].sum()),
        "recent_compared": int(recent.sum()),
        "recent_mismatches": recent_mismatches,
        "recent_mismatch_ratio": recent_mismatches / max(int(recent.sum()), 1),
        "only_in_r2": len(stored.index.difference(reference.index)),
        "only_in_postgres_since_2019": int((only_pg >= STRICT_FROM).sum()),
    }


def verify_passes(report: dict[str, float | int]) -> bool:
    return (
        report["recent_mismatch_ratio"] <= MAX_RECENT_MISMATCH_RATIO
        and report["only_in_postgres_since_2019"] == 0
    )


def verify(symbol: str) -> int:
    store = get_store()
    with db.connection() as conn:
        assets = _assets(conn, symbol)
        for asset_id, _, pair, history_since, until in assets:
            if until is None:
                logger.error("%s has no history in R2 yet", pair)
                return 1
            start = _midnight(history_since)
            rows = conn.execute(
                """
                select open_time, open, high, low, close, volume from candles_1h
                where asset_id = %s and open_time >= %s and open_time < %s order by open_time
                """,
                (asset_id, start, until),
            ).fetchall()
            reference = pd.DataFrame(rows, columns=_COLUMNS).set_index("open_time")
            reference.index = pd.to_datetime(reference.index, utc=True)
            base: BaseTimeframe = "1h"
            stored = read_candles(store, pair, base, start, until)
            report = compare_1h(stored, reference)
            logger.info("%s: %s", pair, report)
            if not verify_passes(report):
                logger.error("%s: R2 does not match Binance's 1h candles", pair)
                return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.ingest", description=__doc__.split("\n")[0]
    )
    parser.add_argument("command", choices=["backfill", "daily", "verify"])
    parser.add_argument("symbol", nargs="?", help="asset symbol or Binance pair; default: all")
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    db.pool.open()
    try:
        if args.command == "verify":
            if not args.symbol:
                parser.error("verify needs a SYMBOL")
            return verify(args.symbol)
        return run(args.command, args.symbol)
    finally:
        db.pool.close()


if __name__ == "__main__":
    sys.exit(main())
