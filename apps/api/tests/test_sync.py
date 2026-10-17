"""`python -m app.sync` scheduling and `PROVIDER_FETCH_ENABLED=false`. No DB or network."""

from contextlib import contextmanager
from datetime import UTC, date, datetime

import httpx
import pandas as pd
import pytest

from app import sync
from app.core.config import get_settings
from app.services import candles, market_data, quotes, warmup


class FakeConn:
    def __init__(self, rows=()):
        self.rows = list(rows)
        self.commits = 0
        self.rolled_back = 0

    def execute(self, *_args, **_kwargs):
        return self

    def fetchall(self):
        return self.rows

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rolled_back += 1


@pytest.fixture
def step(monkeypatch):
    """Runs `sync_step` with fake DB/quotes; returns (state, quote calls, candle rounds, clock)."""
    quote_calls, rounds, clock = [], [], [1000.0]
    result = {"ok": True}

    @contextmanager
    def fake_connection():
        yield FakeConn()

    monkeypatch.setattr(sync.db, "connection", fake_connection)
    monkeypatch.setattr(sync, "refresh_quotes", lambda conn: quote_calls.append(conn))
    monkeypatch.setattr(sync, "sync_candles", lambda conn: rounds.append(conn) or result["ok"])
    monkeypatch.setattr(sync.time, "monotonic", lambda: clock[0])
    return sync.SyncState(), quote_calls, rounds, clock, result


def test_quotes_every_round_candles_once_per_closed_hour(step):
    state, quote_calls, rounds, _, _ = step
    for _ in range(3):
        sync.sync_step(state)
    assert len(quote_calls) == 3
    assert len(rounds) == 1
    assert state.candles_hour == candles.last_closed_open_time(datetime.now(UTC))


def test_failed_candle_round_is_retried_after_a_pause(step):
    state, _, rounds, clock, result = step
    result["ok"] = False
    sync.sync_step(state)
    sync.sync_step(state)
    assert len(rounds) == 1
    assert state.candles_hour is None

    clock[0] += sync.CANDLES_RETRY_SECONDS
    result["ok"] = True
    sync.sync_step(state)
    assert len(rounds) == 2
    assert state.candles_hour is not None


def test_candle_sync_stops_at_an_ip_ban_and_continues_past_other_errors(monkeypatch):
    conn = FakeConn(rows=[(1, "BTCUSDT", date(2020, 1, 1)), (2, "ETHUSDT", date(2020, 1, 1))])
    tried = []

    def failing(error):
        def ensure(_conn, asset, _start, _end):
            tried.append(asset.binance_symbol)
            raise error

        return ensure

    monkeypatch.setattr(sync, "ensure_candles", failing(market_data.ProviderBannedError("ban")))
    assert sync.sync_candles(conn) is False
    assert tried == ["BTCUSDT"]

    tried.clear()
    monkeypatch.setattr(sync, "ensure_candles", failing(httpx.ConnectError("down")))
    assert sync.sync_candles(conn) is False
    assert tried == ["BTCUSDT", "ETHUSDT"]


def test_single_instance_lock(tmp_path):
    first = sync._single_instance_lock(tmp_path / "sync.lock")
    assert first is not None
    try:
        assert sync._single_instance_lock(tmp_path / "sync.lock") is None
    finally:
        first.close()
    second = sync._single_instance_lock(tmp_path / "sync.lock")
    assert second is not None
    second.close()


# --- PROVIDER_FETCH_ENABLED=false --------------------------------------------------------------


@pytest.fixture
def fetch_disabled(monkeypatch):
    monkeypatch.setattr(get_settings(), "provider_fetch_enabled", False)


def test_disabled_providers_are_never_called(fetch_disabled, monkeypatch):
    def handler(_):
        raise AssertionError("no request may leave the process")

    monkeypatch.setattr(
        market_data, "_client", lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    with pytest.raises(market_data.ProviderDisabledError):
        market_data.fetch_tickers_24h(["BTCUSDT"])


def test_disabled_quotes_and_warmup_do_nothing(fetch_disabled, monkeypatch):
    def fail(*_):
        raise AssertionError("must not run")

    monkeypatch.setattr(quotes, "_staleness", fail)
    monkeypatch.setattr(warmup, "_due", fail)
    quotes.ensure_fresh_quotes(None)
    warmup.warm_market_data()


CandleConn = FakeConn


def _hour_rows(start: str, hours: int):
    return [
        (ts.to_pydatetime(), 1.0, 2.0, 0.5, 1.5, 10.0)
        for ts in pd.date_range(start, periods=hours, freq="1h", tz=UTC)
    ]


ASSET = candles.AssetRef(1, "BTCUSDT", date(2020, 1, 1))


def test_provider_failure_serves_stored_candles_without_a_partial_last_one(monkeypatch):
    def broken(*_):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(candles, "ensure_candles", broken)
    conn = CandleConn(_hour_rows("2024-01-01", 10))  # 00:00 .. 09:00 stored
    df = candles.get_candles(
        conn,
        ASSET,
        "4h",
        datetime(2024, 1, 1, tzinfo=UTC),
        datetime(2024, 1, 3, tzinfo=UTC),
        allow_stale=True,
    )
    assert conn.rolled_back == 1
    # 00-04 and 04-08 are complete; 08-12 only has 2 stored hours and is dropped.
    assert list(df.index.hour) == [0, 4]


def test_provider_failure_raises_without_stale_or_stored_data(monkeypatch):
    def broken(*_):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(candles, "ensure_candles", broken)
    args = (ASSET, "1h", datetime(2024, 1, 1, tzinfo=UTC), datetime(2024, 1, 3, tzinfo=UTC))
    with pytest.raises(httpx.ConnectError):
        candles.get_candles(CandleConn(_hour_rows("2024-01-01", 10)), *args)
    with pytest.raises(httpx.ConnectError):
        candles.get_candles(CandleConn([]), *args, allow_stale=True)


def test_disabled_providers_serve_stored_candles_to_every_caller(fetch_disabled, monkeypatch):
    def disabled(*_):
        raise market_data.ProviderDisabledError("off")

    monkeypatch.setattr(candles, "ensure_candles", disabled)
    df = candles.get_candles(
        CandleConn(_hour_rows("2024-01-01", 24)),
        ASSET,
        "1h",
        datetime(2024, 1, 1, tzinfo=UTC),
        datetime(2024, 1, 3, tzinfo=UTC),
    )
    assert len(df) == 24
