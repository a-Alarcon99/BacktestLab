"""Abuse-protection and input-hardening tests. No DB or network: dependencies are overridden."""

from datetime import date

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.routes.backtests import check_range
from app.core.config import get_settings
from app.core.db import get_conn
from app.core.limits import SlidingWindowLimiter, client_ip
from app.core.security import limiter
from app.main import app
from app.services import market_data

VALID_STRATEGY = {
    "initialCapital": 1000,
    "feePct": 0.1,
    "rules": [
        {
            "id": "r1",
            "side": "buy",
            "conditions": [{"kind": "rsi", "period": 14, "op": "below", "value": 30}],
            "size": {"unit": "pct", "value": 100},
        }
    ],
}


def body(**over):
    base = {
        "symbol": "BTC",
        "timeframe": "1d",
        "from": "2024-01-01",
        "to": "2024-03-01",
        "strategy": VALID_STRATEGY,
    }
    return {**base, **over}


@pytest.fixture
def client():
    limiter.reset()
    # Requests that pass validation would need a DB; a sentinel makes that visible.
    app.dependency_overrides[get_conn] = lambda: None
    yield TestClient(
        app,
        raise_server_exceptions=False,
        headers={"X-Internal-Key": get_settings().internal_api_key or ""},
    )
    app.dependency_overrides.clear()
    limiter.reset()


# --- limiter -----------------------------------------------------------------------------------


def test_sliding_window_blocks_then_recovers():
    lim = SlidingWindowLimiter()
    assert [lim.hit("a", 2, 10, now=t) for t in (0, 1)] == [0, 0]
    assert lim.hit("a", 2, 10, now=2) == pytest.approx(8)
    assert lim.hit("b", 2, 10, now=2) == 0  # other keys are independent
    assert lim.hit("a", 2, 10, now=11) == 0  # first hit left the window


def test_limiter_memory_is_bounded():
    lim = SlidingWindowLimiter(max_keys=100)
    for i in range(1_000):
        lim.hit(f"ip{i}", 1, 60, now=float(i))
    assert len(lim._hits) <= 100


def test_client_ip_ignores_forwarded_header_without_trusted_proxy():
    assert client_ip("10.0.0.1", "6.6.6.6", 0) == "10.0.0.1"


def test_client_ip_uses_entry_added_by_trusted_proxy():
    # A spoofed leftmost value is ignored: only the entry the trusted proxy appended counts.
    assert client_ip("10.0.0.1", "6.6.6.6, 203.0.113.9", 1) == "203.0.113.9"
    assert client_ip("10.0.0.1", None, 1) == "10.0.0.1"


# --- HTTP layer --------------------------------------------------------------------------------


def test_backtest_endpoint_is_rate_limited_per_ip(client):
    limit = get_settings().rate_limit_backtest_per_minute
    codes = [
        client.post("/backtests/run", json=body(symbol="!!")).status_code for _ in range(limit + 2)
    ]
    assert codes[:limit] == [422] * limit  # rejected by validation, but still counted
    assert codes[limit:] == [429, 429]
    res = client.post("/backtests/run", json=body(symbol="!!"))
    assert res.headers["Retry-After"].isdigit()


def test_spoofed_forwarded_for_does_not_bypass_limit(client, monkeypatch):
    # Without the internal key (and no trusted proxy) the header is ignored: only the peer counts.
    monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 0)
    limit = get_settings().rate_limit_backtest_per_minute
    bad = {"X-Internal-Key": "wrong"}
    for i in range(limit):
        client.post(
            "/backtests/run",
            json=body(symbol="!!"),
            headers={**bad, "X-Forwarded-For": f"1.1.1.{i}"},
        )
    res = client.post(
        "/backtests/run", json=body(symbol="!!"), headers={**bad, "X-Forwarded-For": "9.9.9.9"}
    )
    assert res.status_code == 429


def test_web_app_forwarded_ip_is_used_with_internal_key(client, monkeypatch):
    # The web app is the single peer: its forwarded client address keeps users in separate buckets.
    monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 0)
    limit = get_settings().rate_limit_backtest_per_minute
    for i in range(limit):
        client.post(
            "/backtests/run", json=body(symbol="!!"), headers={"X-Forwarded-For": f"1.1.1.{i}"}
        )
    res = client.post(
        "/backtests/run", json=body(symbol="!!"), headers={"X-Forwarded-For": "9.9.9.9"}
    )
    assert res.status_code != 429


def test_web_app_forwarded_ip_is_found_behind_a_platform_proxy(client, monkeypatch):
    # One platform proxy (Render, Fly...) appends the web app's address after the client's.
    monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 1)
    limit = get_settings().rate_limit_backtest_per_minute
    for i in range(limit):
        client.post(
            "/backtests/run",
            json=body(symbol="!!"),
            headers={"X-Forwarded-For": f"1.1.1.{i}, 76.76.21.21"},
        )
    res = client.post(
        "/backtests/run",
        json=body(symbol="!!"),
        headers={"X-Forwarded-For": "9.9.9.9, 76.76.21.21"},
    )
    assert res.status_code != 429


def test_oversized_body_is_rejected(client):
    big = {"padding": "x" * (get_settings().max_body_bytes + 1)}
    assert client.post("/backtests/run", json=big).status_code == 413


def test_security_headers_present(client):
    res = client.get("/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"


def test_cors_does_not_allow_credentials_or_foreign_origins(client):
    res = client.options(
        "/assets",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in res.headers
    assert "access-control-allow-credentials" not in res.headers


# --- input validation --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        body(symbol="BTC'; drop table assets;--"),
        body(symbol="A" * 21),
        body(strategy={**VALID_STRATEGY, "initialCapital": float("inf")}),
        body(
            strategy={**VALID_STRATEGY, "rules": [{**VALID_STRATEGY["rules"][0], "id": "x" * 65}]}
        ),
        body(strategy={**VALID_STRATEGY, "rules": []}),
        body(**{"from": "9999-12-31", "to": "9999-12-31"}),
    ],
)
def test_malicious_or_oversized_payload_is_rejected_before_any_work(client, payload):
    res = client.post(
        "/backtests/run",
        content=__import__("json").dumps(payload, allow_nan=True),
        headers={"Content-Type": "application/json"},
    )
    assert res.status_code == 422


def test_symbol_path_is_validated(client):
    assert client.get("/assets/" + "A" * 50).status_code == 422
    assert client.get("/assets/BTC%27--/candles").status_code == 422


def test_range_checks():
    today = date(2026, 6, 1)
    ok = lambda f, t, tf="1d": check_range(f, t, tf, 100_000, today)
    ok(date(2024, 1, 1), date(2024, 12, 31))
    ok(date(2026, 4, 1), date(2026, 5, 31), "1m")  # 61 days = 87.8k candles
    ok(date(2025, 6, 1), date(2026, 5, 31), "15m")
    for f, t, tf in [
        (date(2024, 2, 1), date(2024, 1, 1), "1d"),  # inverted
        (date(1999, 1, 1), date(2024, 1, 1), "1d"),  # before any market
        (date(2024, 1, 1), date(2030, 1, 1), "1d"),  # future
        (date(2010, 1, 1), date(2026, 6, 1), "1h"),  # ~140k 1h candles
        (date(2026, 1, 1), date(2026, 6, 1), "1m"),  # ~217k 1m candles
    ]:
        with pytest.raises(HTTPException) as e:
            ok(f, t, tf)
        assert e.value.status_code == 422


# --- provider budget ---------------------------------------------------------------------------


def test_provider_calls_are_budgeted(monkeypatch):
    limiter.reset()
    monkeypatch.setattr(get_settings(), "provider_calls_per_minute", 3)
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=[])

    market_data._client.cache_clear()
    monkeypatch.setattr(
        market_data, "_client", lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    for _ in range(3):
        market_data._get("https://x.test", {})
    with pytest.raises(market_data.ProviderBudgetError):
        market_data._get("https://x.test", {})
    assert calls == 3
    limiter.reset()


def test_retry_after_sleep_is_capped(monkeypatch):
    assert market_data._retry_after("3600") == market_data._MAX_BACKOFF_SECONDS
    assert market_data._retry_after("garbage") == 1
    assert market_data._retry_after("-5") == 0
