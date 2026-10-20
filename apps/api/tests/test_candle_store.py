"""Parquet layout, the reader (R2 history + 1m hot tail) and the ingest parsing. No DB or network."""

import hashlib
import io
import os
import zipfile
from datetime import UTC, date, datetime, timedelta

import httpx
import pandas as pd
import pytest

from app import ingest
from app.services import candle_store, candles
from app.services.candle_store import FileRef, LocalStore, file_ref, file_refs


def dt(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def minutely(start: datetime, minutes: int) -> pd.DataFrame:
    index = pd.date_range(start, periods=minutes, freq="1min", tz=UTC, name="open_time")
    n = pd.Series(range(minutes), index=index, dtype=float)
    return pd.DataFrame(
        {"open": n, "high": n + 0.5, "low": n - 0.5, "close": n + 0.25, "volume": 1.0}
    )


class TestLayout:
    def test_one_file_per_month_for_1m_and_per_year_for_the_rest(self):
        assert file_ref("BTCUSDT", "1m", 2024, 3).key == "candles/BTCUSDT/1m/2024/2024-03.parquet"
        assert file_ref("BTCUSDT", "1h", 2024, 3).key == "candles/BTCUSDT/1h/2024.parquet"
        assert file_ref("BTCUSDT", "15m", 2024).end == dt(2025, 1, 1)
        assert file_ref("BTCUSDT", "1m", 2024, 12).end == dt(2025, 1, 1)

    def test_files_covering_a_range(self):
        refs = file_refs("X", "1m", dt(2024, 12, 20), dt(2025, 2, 1))
        assert [r.key[-15:] for r in refs] == ["2024-12.parquet", "2025-01.parquet"]
        refs = file_refs("X", "1h", dt(2023, 6, 1), dt(2025, 1, 1, 0, 1))
        assert [r.start.year for r in refs] == [2023, 2024, 2025]

    def test_end_is_exclusive(self):
        assert len(file_refs("X", "1m", dt(2024, 1, 1), dt(2024, 2, 1))) == 1


def test_encode_decode_roundtrip():
    df = minutely(dt(2024, 1, 1), 100)
    out = candle_store.decode(candle_store.encode(df))
    pd.testing.assert_frame_equal(out, df, check_freq=False, check_index_type=False)
    assert str(out.index.tz) == "UTC"


# --- reader ---------------------------------------------------------------------------------


class FakeConn:
    def __init__(self, rows=()):
        self.rows = list(rows)

    def execute(self, *_a, **_k):
        return self

    def fetchall(self):
        return self.rows


ASSET = candles.AssetRef(1, "BTCUSDT", date(2020, 1, 1), dt(2024, 1, 3))


@pytest.fixture
def store(tmp_path):
    s = LocalStore(tmp_path)
    # Two full days (Jan 1-2) of 1m in R2 and the 15m / 1h files derived from them.
    ingest.write_candles(s, "BTCUSDT", minutely(dt(2024, 1, 1), 2 * 1440))
    return s


def tail_rows(start: datetime, minutes: int):
    return [
        (ts.to_pydatetime(), float(i), i + 0.5, i - 0.5, i + 0.25, 1.0)
        for i, ts in enumerate(pd.date_range(start, periods=minutes, freq="1min", tz=UTC))
    ]


def freeze_now(monkeypatch, now: datetime) -> None:
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return now

    monkeypatch.setattr(candles, "datetime", Frozen)


def test_reads_history_from_the_base_that_divides_the_timeframe(store):
    args = (FakeConn(), ASSET)
    one_day = (dt(2024, 1, 1), dt(2024, 1, 2))
    # `end` is an inclusive open time: the 1m candle at 00:00 of Jan 2 comes along.
    assert len(candles.get_candles(*args, "1m", *one_day, store=store)) == 1441
    assert len(candles.get_candles(*args, "5m", *one_day, store=store)) == 288
    assert len(candles.get_candles(*args, "30m", *one_day, store=store)) == 48
    assert len(candles.get_candles(*args, "4h", *one_day, store=store)) == 6
    daily = candles.get_candles(*args, "1d", dt(2024, 1, 1), dt(2024, 1, 3), store=store)
    assert list(daily.index) == [dt(2024, 1, 1), dt(2024, 1, 2)]
    assert daily.volume.tolist() == [1440, 1440]


def test_hot_tail_extends_the_history_without_partial_candles(store, monkeypatch):
    freeze_now(monkeypatch, dt(2024, 1, 3, 3, 7, 30))
    # Tail: 03 Jan 00:00 .. 03:06, the closed minutes at 03:07:30.
    conn = FakeConn(tail_rows(dt(2024, 1, 3), 3 * 60 + 7))
    one_min = candles.get_candles(conn, ASSET, "1m", dt(2024, 1, 2), dt(2024, 1, 4), store=store)
    assert one_min.index[-1] == dt(2024, 1, 3, 3, 6)
    hourly = candles.get_candles(conn, ASSET, "1h", dt(2024, 1, 2), dt(2024, 1, 4), store=store)
    assert hourly.index[-1] == dt(2024, 1, 3, 2)  # the 03:00 hour is still open at 03:07
    assert len(hourly) == 24 + 3


def test_data_stops_at_candles_until_when_there_is_no_tail(store, monkeypatch):
    freeze_now(monkeypatch, dt(2024, 2, 1))
    got = candles.get_candles(FakeConn(), ASSET, "1h", dt(2024, 1, 1), dt(2024, 2, 1), store=store)
    assert got.index[-1] == dt(2024, 1, 2, 23)


def test_range_shorter_than_a_day_is_rejected(store):
    with pytest.raises(candles.InvalidRangeError):
        candles.get_candles(
            FakeConn(), ASSET, "1m", dt(2024, 1, 1), dt(2024, 1, 1, 12), store=store
        )


def test_cache_serves_closed_files_without_asking_the_store(tmp_path, monkeypatch):
    monkeypatch.setattr(candle_store.get_settings(), "candle_cache_dir", str(tmp_path / "cache"))

    class Counting(LocalStore):
        cacheable = True
        reads = 0

        def get(self, key):
            self.reads += 1
            return super().get(key)

    s = Counting(tmp_path / "bucket")
    ingest.write_candles(s, "BTCUSDT", minutely(dt(2024, 1, 1), 1440))
    s.reads = 0
    ref = file_ref("BTCUSDT", "1h", 2024)
    closed = FileRef(
        ref.key, ref.start, datetime.fromtimestamp(0, UTC)
    )  # ended before the download
    assert candle_store.read_file(s, closed) == candle_store.read_file(s, closed)
    assert s.reads == 1
    assert candle_store.read_file(s, FileRef("candles/none.parquet", ref.start, ref.end)) is None


def test_cache_is_pruned_to_its_limit(tmp_path):
    for i in range(4):
        path = tmp_path / f"{i}.parquet"
        path.write_bytes(b"x" * 100)
        os.utime(path, (1000 + i, 1000 + i))
    candle_store._prune_cache(tmp_path, 250)
    assert sorted(p.name for p in tmp_path.glob("*.parquet")) == ["2.parquet", "3.parquet"]


# --- ingest ---------------------------------------------------------------------------------


def make_zip(csv: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("BTCUSDT-1m.csv", csv)
    return buf.getvalue()


ROW = "{t},1.0,2.0,0.5,1.5,10.0,0,0,0,0,0,0"


def test_parse_milliseconds_without_header():
    t = int(dt(2024, 5, 1).timestamp() * 1000)
    csv = "\n".join(ROW.format(t=t + i * 60_000) for i in range(3))
    df = ingest.parse_klines(make_zip(csv))
    assert list(df.index) == [dt(2024, 5, 1) + timedelta(minutes=i) for i in range(3)]
    assert df.iloc[0].tolist() == [1.0, 2.0, 0.5, 1.5, 10.0]


def test_parse_microseconds_with_header():
    t = int(dt(2025, 1, 1).timestamp() * 1_000_000)
    header = "open_time,open,high,low,close,volume,close_time,qav,trades,tb,tq,ignore"
    csv = header + "\n" + "\n".join(ROW.format(t=t + i * 60_000_000) for i in range(2))
    df = ingest.parse_klines(make_zip(csv))
    assert list(df.index) == [dt(2025, 1, 1), dt(2025, 1, 1, 0, 1)]


def test_parse_keeps_gaps_and_drops_duplicates():
    t = int(dt(2024, 5, 1).timestamp() * 1000)
    csv = "\n".join(ROW.format(t=t + m * 60_000) for m in (0, 0, 5))
    assert len(ingest.parse_klines(make_zip(csv))) == 2


def vision_client(files: dict[str, bytes]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        body = files.get(request.url.path)
        return httpx.Response(404) if body is None else httpx.Response(200, content=body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def published(kind: str, period: str, zipped: bytes, checksum: str | None = None):
    path = f"/data/spot/{kind}/klines/BTCUSDT/1m/BTCUSDT-1m-{period}.zip"
    digest = checksum or hashlib.sha256(zipped).hexdigest()
    return {path: zipped, path + ".CHECKSUM": f"{digest}  BTCUSDT-1m-{period}.zip\n".encode()}


def day_csv(day: date) -> str:
    t = int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp() * 1000)
    return "\n".join(ROW.format(t=t + i * 60_000) for i in range(1440))


def test_checksum_mismatch_is_rejected():
    files = published("daily", "2024-05-01", make_zip(day_csv(date(2024, 5, 1))), checksum="0" * 64)
    with pytest.raises(ValueError, match="Checksum"):
        ingest.fetch_zip(vision_client(files), "daily", "BTCUSDT", "2024-05-01")


def test_missing_zip_is_none():
    assert ingest.fetch_zip(vision_client({}), "daily", "BTCUSDT", "2024-05-01") is None


def test_ingest_days_uses_daily_zips_and_stops_at_the_first_unpublished_day(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest.time, "sleep", lambda _: None)
    files = {}
    for d in (date(2024, 5, 1), date(2024, 5, 2), date(2024, 5, 4)):  # the 3rd is missing
        files |= published("daily", d.isoformat(), make_zip(day_csv(d)))
    s = LocalStore(tmp_path)
    client = vision_client(files)
    done = ingest.ingest_days(s, client, "BTCUSDT", date(2024, 5, 1), date(2024, 5, 6))
    assert done == date(2024, 5, 3)
    assert (
        len(candle_store.read_candles(s, "BTCUSDT", "1m", dt(2024, 5, 1), dt(2024, 5, 10))) == 2880
    )
    assert len(candle_store.read_candles(s, "BTCUSDT", "1h", dt(2024, 5, 1), dt(2024, 5, 10))) == 48
    # Idempotent: ingesting again changes nothing.
    ingest.ingest_days(s, client, "BTCUSDT", date(2024, 5, 1), date(2024, 5, 3))
    assert (
        len(candle_store.read_candles(s, "BTCUSDT", "1m", dt(2024, 5, 1), dt(2024, 5, 10))) == 2880
    )


def test_ingest_days_prefers_the_monthly_zip_and_falls_back_to_daily(tmp_path):
    month = "\n".join(day_csv(date(2024, 2, d)) for d in range(1, 30))  # leap February
    s = LocalStore(tmp_path)
    client = vision_client(published("monthly", "2024-02", make_zip(month)))
    done = ingest.ingest_days(s, client, "BTCUSDT", date(2024, 2, 1), date(2024, 3, 5))
    assert done == date(2024, 3, 1)  # March has neither monthly nor daily zips
    stored = candle_store.read_candles(s, "BTCUSDT", "1m", dt(2024, 2, 1), dt(2024, 3, 1))
    assert len(stored) == 29 * 1440

    files = {}
    for d in range(1, 30):
        files |= published("daily", f"2024-02-{d:02d}", make_zip(day_csv(date(2024, 2, d))))
    s2 = LocalStore(tmp_path / "second")
    done = ingest.ingest_days(
        s2, vision_client(files), "BTCUSDT", date(2024, 2, 1), date(2024, 3, 1)
    )
    assert done == date(2024, 3, 1)


def hourly_ref(start: str, hours: int) -> pd.DataFrame:
    idx = pd.date_range(start, periods=hours, freq="1h", tz=UTC)
    return pd.DataFrame(
        {"open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10.0}, index=idx
    )


def test_compare_1h_identical_passes():
    ref = hourly_ref("2024-01-01", 100)
    report = ingest.compare_1h(ref.copy(), ref)
    assert report["recent_mismatches"] == 0 and ingest.verify_passes(report)


def test_compare_1h_ignores_the_range_postgres_does_not_cover():
    ref = hourly_ref("2024-01-01", 100)
    report = ingest.compare_1h(hourly_ref("2024-01-01", 150), ref)
    assert report["only_in_r2"] == 0 and ingest.verify_passes(report)


def test_compare_1h_old_open_differences_never_fail():
    ref = hourly_ref("2017-09-01", 100)
    stored = ref.copy()
    stored["open"] = 1.1
    report = ingest.compare_1h(stored, ref)
    assert report["mismatches_before_2019"] == 100 and ingest.verify_passes(report)


def test_compare_1h_recent_differences_and_missing_hours_fail():
    ref = hourly_ref("2024-01-01", 100)
    off = ref.copy()
    off.iloc[1, 1] = 3.0  # 1 of 100 hours differs: above the tolerated share
    assert not ingest.verify_passes(ingest.compare_1h(off, ref))
    report = ingest.compare_1h(ref.drop(ref.index[5]), ref)
    assert report["only_in_postgres_since_2019"] == 1 and not ingest.verify_passes(report)
