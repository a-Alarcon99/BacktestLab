"""Warm-up throttle and the stale-while-revalidate policy of quotes. No DB or network."""

from contextlib import contextmanager

import pytest

from app.services import quotes, warmup


class FakeConn:
    def __init__(self):
        self.rolled_back = 0

    def execute(self, *_args, **_kwargs):
        return self

    def fetchall(self):
        return []

    def commit(self):
        pass

    def rollback(self):
        self.rolled_back += 1


@pytest.fixture
def clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(warmup.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(warmup, "_last_run", None)
    return now


@pytest.fixture
def refreshes(monkeypatch):
    calls = []

    @contextmanager
    def fake_connection():
        yield FakeConn()

    monkeypatch.setattr(warmup.db, "connection", fake_connection)
    monkeypatch.setattr(warmup, "refresh_quotes", lambda conn: calls.append(conn))
    return calls


def test_warmup_is_throttled(clock, refreshes):
    warmup.warm_market_data()
    warmup.warm_market_data()
    assert len(refreshes) == 1
    clock[0] += warmup.get_settings().warmup_min_interval_seconds
    warmup.warm_market_data()
    assert len(refreshes) == 2


def test_warmup_never_raises(clock, monkeypatch):
    @contextmanager
    def broken():
        raise RuntimeError("db down")
        yield

    monkeypatch.setattr(warmup.db, "connection", broken)
    warmup.warm_market_data()


@pytest.fixture
def policy(monkeypatch):
    calls = {"blocking": 0, "background": 0}
    monkeypatch.setattr(quotes, "refresh_quotes", lambda conn: calls.__setitem__("blocking", 1))
    monkeypatch.setattr(
        quotes, "_refresh_in_background", lambda: calls.__setitem__("background", 1)
    )

    def set_state(state):
        monkeypatch.setattr(quotes, "_staleness", lambda conn: state)

    return calls, set_state


def test_fresh_quotes_do_nothing(policy):
    calls, set_state = policy
    set_state(quotes._Staleness(False, False, False))
    quotes.ensure_fresh_quotes(None)
    assert calls == {"blocking": 0, "background": 0}


def test_slightly_stale_quotes_refresh_in_background(policy):
    calls, set_state = policy
    set_state(quotes._Staleness(True, False, False))
    quotes.ensure_fresh_quotes(None)
    assert calls == {"blocking": 0, "background": 1}


def test_unusable_quotes_block_until_refreshed(policy):
    calls, set_state = policy
    set_state(quotes._Staleness(True, False, True))
    quotes.ensure_fresh_quotes(None)
    assert calls == {"blocking": 1, "background": 0}


def test_unusable_quotes_in_failure_backoff_serve_what_is_stored(policy):
    calls, set_state = policy
    set_state(quotes._Staleness(False, False, True))
    quotes.ensure_fresh_quotes(None)
    assert calls == {"blocking": 0, "background": 0}


def test_only_one_background_refresh_at_a_time(monkeypatch):
    submitted = []
    monkeypatch.setattr(quotes._background, "submit", lambda fn: submitted.append(fn))
    assert quotes._background_busy.acquire(blocking=False)
    try:
        quotes._background_busy.release()
        quotes._refresh_in_background()
        quotes._refresh_in_background()
        assert len(submitted) == 1
    finally:
        if quotes._background_busy.locked():
            quotes._background_busy.release()
