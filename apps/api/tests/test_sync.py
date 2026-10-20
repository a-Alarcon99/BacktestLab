"""`python -m app.sync` scheduling and `PROVIDER_FETCH_ENABLED=false`. No DB or network."""

from contextlib import contextmanager
from datetime import UTC, date, datetime

import httpx
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


def test_quotes_every_round_candles_once_per_closed_minute(step):
    state, quote_calls, rounds, _, _ = step
    for _ in range(3):
        sync.sync_step(state)
    assert len(quote_calls) == 3
    assert len(rounds) == 1
    assert state.candles_minute == candles.last_closed_open_time(datetime.now(UTC), "1m")


def test_failed_candle_round_is_retried_after_a_pause(step):
    state, _, rounds, clock, result = step
    result["ok"] = False
    sync.sync_step(state)
    sync.sync_step(state)
    assert len(rounds) == 1
    assert state.candles_minute is None

    clock[0] += sync.CANDLES_RETRY_SECONDS
    result["ok"] = True
    sync.sync_step(state)
    assert len(rounds) == 2
    assert state.candles_minute is not None


def test_candle_sync_stops_at_an_ip_ban_and_continues_past_other_errors(monkeypatch):
    conn = FakeConn(
        rows=[(1, "BTCUSDT", date(2020, 1, 1), None), (2, "ETHUSDT", date(2020, 1, 1), None)]
    )
    tried = []

    def failing(error):
        def ensure(_conn, asset):
            tried.append(asset.binance_symbol)
            raise error

        return ensure

    monkeypatch.setattr(sync, "sync_recent", failing(market_data.ProviderBannedError("ban")))
    assert sync.sync_candles(conn) is False
    assert tried == ["BTCUSDT"]

    tried.clear()
    monkeypatch.setattr(sync, "sync_recent", failing(httpx.ConnectError("down")))
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
