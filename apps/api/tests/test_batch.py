"""`POST /backtests/batch`: independent runs of one strategy over several assets."""

from datetime import UTC, date, datetime

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from test_security import VALID_STRATEGY

from app.api.routes import backtests
from app.core.config import get_settings
from app.core.db import get_conn
from app.core.security import limiter
from app.main import app
from app.services.candles import AssetRef


def payload(**over):
    base = {
        "kind": "assets",
        "symbols": ["BTC", "ETH", "NEW"],
        "timeframe": "1d",
        "from": "2024-01-01",
        "to": "2024-06-30",
        "strategy": VALID_STRATEGY,
    }
    return {**base, **over}


def wave(start: datetime, end: datetime, seed: int) -> pd.DataFrame:
    index = pd.date_range(start, end, freq="1D", tz=UTC, name="open_time", inclusive="left")
    x = np.arange(len(index))
    close = 100 + 15 * np.sin(x / (6 + seed)) + x * 0.05 * (seed + 1)
    s = pd.Series(close, index=index)
    return pd.DataFrame({"open": s, "high": s + 1, "low": s - 1, "close": s, "volume": 10.0})


# "NEW" is listed after the range ends, so it has no candles in it.
ASSETS = {
    "BTC": AssetRef(1, "BTCUSDT", date(2017, 1, 1)),
    "ETH": AssetRef(2, "ETHUSDT", date(2017, 1, 1)),
    "NEW": AssetRef(3, "NEWUSDT", date(2024, 6, 30)),
    "LATE": AssetRef(4, "LATEUSDT", date(2024, 3, 1)),
}
calls: list[str] = []


@pytest.fixture
def client(monkeypatch):
    calls.clear()

    def fake_candles(_conn, asset, _tf, start, end):
        calls.append(asset.binance_symbol)
        start = max(start, datetime.combine(asset.history_since, datetime.min.time(), UTC))
        return wave(start, end, asset.id)

    monkeypatch.setattr(backtests, "get_asset_ref", lambda _c, sym: ASSETS.get(sym.upper()))
    monkeypatch.setattr(backtests, "get_candles", fake_candles)
    limiter.reset()
    app.dependency_overrides[get_conn] = lambda: None
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()
    limiter.reset()


def post(client, **over):
    return client.post(
        "/backtests/batch",
        json=payload(**over),
        headers={"X-Internal-Key": get_settings().internal_api_key},
    )


def test_requires_the_internal_key(client):
    assert client.post("/backtests/batch", json=payload()).status_code == 401


def test_runs_each_asset_independently_with_the_full_capital(client):
    res = post(client, symbols=["BTC", "ETH"])
    assert res.status_code == 200
    body = res.json()
    assert body["kind"] == "assets"
    assert [i["symbol"] for i in body["items"]] == ["BTC", "ETH"]
    for item in body["items"]:
        assert item["error"] is None
        assert len(item["result"]["candles"]) <= 1500
        assert item["result"]["equity"][0] > 900  # started from the 1000 USDT, not a share of it
    # Candles of every asset are read exactly once.
    assert sorted(calls) == ["BTCUSDT", "ETHUSDT"]
    # Same numbers as running the asset alone.
    alone = client.post(
        "/backtests/run",
        json={k: v for k, v in payload(symbol="ETH").items() if k not in ("kind", "symbols")},
        headers={"X-Internal-Key": get_settings().internal_api_key},
    ).json()
    assert alone["stats"] == body["items"][1]["result"]["stats"]


def test_asset_without_candles_is_reported_not_fatal(client):
    items = post(client, symbols=["BTC", "NEW"]).json()["items"]
    assert items[0]["result"] is not None
    assert items[1] == {"symbol": "NEW", "result": None, "error": "no-candles", "startsAt": None}


def test_later_listing_starts_later(client):
    items = post(client, symbols=["BTC", "LATE"]).json()["items"]
    assert items[0]["startsAt"].startswith("2024-01-01")
    assert items[1]["startsAt"].startswith("2024-03-01")


def test_unknown_asset_is_404(client):
    assert post(client, symbols=["BTC", "NOPE"]).status_code == 404


def test_duplicate_symbols_are_rejected(client):
    assert post(client, symbols=["BTC", "btc"]).status_code == 422


def test_too_many_assets_are_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_batch_items", 2)
    assert post(client, symbols=["BTC", "ETH", "LATE"]).status_code == 422


def test_work_budget_is_enforced_before_any_work(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_batch_work", 300)  # 3 assets x 182 candles
    res = post(client)
    assert res.status_code == 422
    assert "work budget" in res.json()["detail"]
    assert calls == []


def test_only_one_batch_runs_at_a_time(client):
    assert backtests._batch_slots.acquire(blocking=False)
    try:
        res = post(client, symbols=["BTC"])
        assert res.status_code == 503
        assert res.headers["retry-after"] == "5"
    finally:
        backtests._batch_slots.release()


def test_conflicting_strategy_is_rejected(client):
    rule = VALID_STRATEGY["rules"][0]
    clash = {
        **rule,
        "id": "r2",
        "conditions": [{"kind": "rsi", "period": 14, "op": "below", "value": 40}],
    }
    strategy = {**VALID_STRATEGY, "rules": [rule, {**clash, "side": "sell"}]}
    res = post(client, strategy=strategy, symbols=["BTC"])
    assert res.status_code == 422
    assert calls == []
