"""`POST /backtests/batch` robustness kinds: windows, sensitivity and timeframes."""

from datetime import UTC, date, datetime

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.api.routes import backtests
from app.core.config import get_settings
from app.core.db import get_conn
from app.core.security import limiter
from app.main import app
from app.services.candles import TIMEFRAME_SPAN, AssetRef
from app.strategies.robustness import chosen_timeframes, neighbor_timeframes, window_bounds

EPOCH = datetime(2020, 1, 1, tzinfo=UTC)
ASSET = AssetRef(1, "BTCUSDT", date(2020, 1, 1))
KEY = {"X-Internal-Key": get_settings().internal_api_key}

STRATEGY = {
    "initialCapital": 1000,
    "feePct": 0.1,
    "rules": [
        {
            "id": "b",
            "side": "buy",
            "conditions": [{"kind": "rsi", "period": 14, "op": "below", "value": 35}],
            "size": {"unit": "pct", "value": 100},
        },
        {
            "id": "s",
            "side": "sell",
            "conditions": [{"kind": "rsi", "period": 14, "op": "above", "value": 65}],
            "size": {"unit": "pct", "value": 100},
        },
    ],
}
CALLS: list[str] = []


def candles(timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
    """A wave that depends on the absolute time, so any slice sees the same prices."""
    step = "1MS" if timeframe == "1M" else f"{int(TIMEFRAME_SPAN[timeframe].total_seconds())}s"
    first = max(start, EPOCH)
    index = pd.date_range(first, end, freq=step, tz=UTC, name="open_time", inclusive="left")
    x = (index - EPOCH).total_seconds().to_numpy() / 86_400
    close = pd.Series(100 + 20 * np.sin(x / 9) + 6 * np.sin(x / 2.3) + x * 0.03, index=index)
    return pd.DataFrame(
        {"open": close, "high": close + 1, "low": close - 1, "close": close, "volume": 5.0}
    )


@pytest.fixture
def client(monkeypatch):
    CALLS.clear()

    def fake_candles(_conn, _asset, timeframe, start, end):
        CALLS.append(timeframe)
        return candles(timeframe, start, end)

    monkeypatch.setattr(
        backtests, "get_asset_ref", lambda _c, sym: ASSET if sym.upper() == "BTC" else None
    )
    monkeypatch.setattr(backtests, "get_candles", fake_candles)
    limiter.reset()
    app.dependency_overrides[get_conn] = lambda: None
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()
    limiter.reset()


def base(**over):
    return {
        "symbol": "BTC",
        "timeframe": "1d",
        "from": "2024-01-01",
        "to": "2024-06-30",
        "strategy": STRATEGY,
        **over,
    }


def batch(client, **over):
    return client.post("/backtests/batch", json=base(**over), headers=KEY)


def run(client, **over):
    return client.post("/backtests/run", json=base(**over), headers=KEY)


# --- windows ------------------------------------------------------------------------------------


def test_window_bounds_fit_inside_the_range():
    windows = window_bounds(date(2024, 1, 1), date(2024, 1, 31), 10, 10)
    assert windows == [
        (date(2024, 1, 1), date(2024, 1, 10)),
        (date(2024, 1, 11), date(2024, 1, 20)),
        (date(2024, 1, 21), date(2024, 1, 30)),
    ]
    assert window_bounds(date(2024, 1, 1), date(2024, 1, 5), 10, 1) == []


def test_each_window_equals_a_direct_backtest_of_that_slice(client):
    res = batch(client, kind="windows", lengthDays=60, stepDays=30)
    assert res.status_code == 200
    body = res.json()
    assert body["kind"] == "windows"
    assert len(body["items"]) == 5
    assert len(body["prices"]) > 10
    for item in body["items"]:
        direct = run(client, **{"from": item["start"], "to": item["end"]}).json()["stats"]
        summary = item["summary"]
        assert summary["returnPct"] == pytest.approx(direct["returnPct"])
        assert summary["benchmarkReturnPct"] == pytest.approx(direct["benchmarkReturnPct"])
        assert summary["maxDrawdownPct"] == pytest.approx(direct["maxDrawdownPct"])
        assert summary["orders"] == direct["trades"]
        assert summary["curve"][0] == pytest.approx(100)
    # The candles are read once for all the windows.
    assert CALLS.count("1d") == 1 + 5  # one read + the five direct runs


def test_windows_longer_than_the_range_are_rejected(client):
    assert batch(client, kind="windows", lengthDays=400, stepDays=30).status_code == 422


def test_too_many_windows_are_rejected(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_batch_items", 3)
    assert batch(client, kind="windows", lengthDays=30, stepDays=15).status_code == 422


def test_windows_with_too_few_candles_are_rejected(client):
    assert batch(client, kind="windows", lengthDays=5, stepDays=5).status_code == 422


def test_windows_work_budget_is_enforced_before_reading(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_batch_work", 100)
    res = batch(client, kind="windows", lengthDays=60, stepDays=30)
    assert res.status_code == 422
    assert "work budget" in res.json()["detail"]
    assert CALLS == []


# --- sensitivity --------------------------------------------------------------------------------


def test_sensitivity_grid_has_the_base_in_the_centre(client):
    res = batch(client, kind="sensitivity", params=["0:0:period", "0:0:value"])
    assert res.status_code == 200
    reads = list(CALLS)
    body = res.json()
    assert [a["id"] for a in body["axes"]] == ["0:0:period", "0:0:value"]
    assert body["axes"][0]["values"] == [11, 13, 14, 15, 17]
    assert body["axes"][1]["values"] == [28, 31.5, 35, 38.5, 42]
    assert len(body["cells"]) == 25
    # The last axis varies fastest.
    assert [c["coords"] for c in body["cells"][:3]] == [[0, 0], [0, 1], [0, 2]]
    assert reads == ["1d"]  # one read of the candles for the whole grid
    centre = next(c for c in body["cells"] if c["coords"] == [2, 2])
    direct = run(client).json()["stats"]
    assert centre["summary"]["returnPct"] == pytest.approx(direct["returnPct"])


def test_sensitivity_with_one_parameter_has_five_cells(client):
    body = batch(client, kind="sensitivity", params=["1:0:value"]).json()
    assert len(body["cells"]) == 5
    assert all(c["error"] is None for c in body["cells"])


def test_unknown_parameter_is_rejected(client):
    assert batch(client, kind="sensitivity", params=["0:0:nope"]).status_code == 422
    assert batch(client, kind="sensitivity", params=["7:0:value"]).status_code == 422


def test_duplicate_parameters_are_rejected(client):
    assert batch(client, kind="sensitivity", params=["0:0:value", "0:0:value"]).status_code == 422


def test_variants_that_contradict_are_marked_not_run(client):
    strategy = {
        **STRATEGY,
        "rules": [
            {
                **STRATEGY["rules"][0],
                "conditions": [{"kind": "rsi", "period": 14, "op": "below", "value": 50}],
            },
            {
                **STRATEGY["rules"][1],
                "conditions": [{"kind": "rsi", "period": 14, "op": "above", "value": 55}],
            },
        ],
    }
    body = batch(
        client, kind="sensitivity", params=["0:0:value", "1:0:value"], strategy=strategy
    ).json()
    errors = [c["error"] for c in body["cells"]]
    assert "conflict" in errors
    assert errors.count(None) < 25
    assert all((c["summary"] is None) == (c["error"] is not None) for c in body["cells"])


def test_variants_that_break_a_condition_are_invalid(client):
    strategy = {
        **STRATEGY,
        "rules": [
            {
                **STRATEGY["rules"][0],
                "conditions": [
                    {"kind": "ma-cross", "ma": "sma", "fast": 20, "slow": 22, "direction": "up"}
                ],
            },
            STRATEGY["rules"][1],
        ],
    }
    body = batch(
        client, kind="sensitivity", params=["0:0:fast", "0:0:slow"], strategy=strategy
    ).json()
    invalid = [c for c in body["cells"] if c["error"] == "invalid"]
    assert invalid and all(c["values"][0] >= c["values"][1] for c in invalid)


def test_sensitivity_work_budget_rejects_big_grids(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_batch_work", 1000)  # 25 x 182 candles
    res = batch(client, kind="sensitivity", params=["0:0:period", "0:0:value"])
    assert res.status_code == 422
    assert CALLS == []


# --- timeframes ---------------------------------------------------------------------------------


def test_neighbors_follow_the_timeframe_order_and_the_range():
    long = neighbor_timeframes("4h", date(2024, 1, 1), date(2024, 6, 30), 100_000)
    assert long == ["1h", "2h", "4h", "1d", "1w"]
    # A short range leaves the weekly candles out (fewer than the minimum).
    short = neighbor_timeframes("4h", date(2024, 1, 1), date(2024, 1, 20), 100_000)
    assert short == ["1h", "2h", "4h", "1d"]
    # Too long for the finer ones.
    capped = neighbor_timeframes("1h", date(2023, 1, 1), date(2024, 12, 31), 20_000)
    assert capped == ["1h", "2h", "4h"]


def test_timeframes_run_the_range_on_each_neighbour(client):
    res = batch(client, kind="timeframes", timeframe="4h")
    assert res.status_code == 200
    items = res.json()["items"]
    assert [i["timeframe"] for i in items] == ["1h", "2h", "4h", "1d", "1w"]
    assert all(i["summary"] is not None for i in items)
    middle = run(client, timeframe="4h").json()["stats"]
    assert items[2]["summary"]["returnPct"] == pytest.approx(middle["returnPct"])


def test_chosen_timeframes_are_the_asked_one_plus_the_requested_in_order():
    args = (date(2024, 1, 1), date(2024, 6, 30), 100_000)
    assert chosen_timeframes("4h", ["1d", "15m"], *args) == ["15m", "4h", "1d"]
    assert chosen_timeframes("4h", None, *args) == ["1h", "2h", "4h", "1d", "1w"]
    # One that gives too few candles is left out, like a neighbour would be.
    assert chosen_timeframes("1d", ["1M", "4h"], date(2024, 1, 1), date(2024, 1, 20), 100_000) == [
        "4h",
        "1d",
    ]


def test_timeframes_run_only_the_chosen_ones(client):
    res = batch(client, kind="timeframes", timeframe="4h", timeframes=["1d", "1h"])
    assert res.status_code == 200
    assert [i["timeframe"] for i in res.json()["items"]] == ["1h", "4h", "1d"]
    assert (
        batch(client, kind="timeframes", timeframe="4h", timeframes=["1d", "1d"]).status_code == 422
    )
    assert batch(client, kind="timeframes", timeframe="4h", timeframes=[]).status_code == 422


def test_summaries_carry_the_extra_figures(client):
    res = batch(client, kind="timeframes", timeframe="4h")
    summary = res.json()["items"][2]["summary"]
    assert len(summary["drawdownCurve"]) == len(summary["curve"])
    assert max(summary["drawdownCurve"]) == pytest.approx(summary["maxDrawdownPct"], abs=0.5)
    assert 0 <= summary["exposurePct"] <= 100
    assert summary["finalCapital"] == pytest.approx(1000 * summary["curve"][-1] / 100, rel=1e-3)
    assert all(0 <= m["at"] <= 1 and m["side"] in ("buy", "sell") for m in summary["marks"])
    assert len(summary["marks"]) <= 60
    if summary["bestTradePct"] is not None:
        assert summary["bestTradePct"] >= summary["worstTradePct"]


def test_timeframes_work_budget(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_batch_work", 500)
    assert batch(client, kind="timeframes", timeframe="4h").status_code == 422


def test_robustness_kinds_need_the_internal_key(client):
    assert (
        client.post(
            "/backtests/batch", json=base(kind="windows", lengthDays=60, stepDays=30)
        ).status_code
        == 401
    )


def test_unknown_kind_is_rejected(client):
    assert batch(client, kind="nope").status_code == 422
