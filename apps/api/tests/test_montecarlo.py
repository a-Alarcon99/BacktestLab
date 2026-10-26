"""Monte Carlo over synthetic paths: pure pieces and `POST /backtests/batch` with `kind: "mc-paths"`."""

from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest
from test_robustness import STRATEGY, batch, candles, client  # noqa: F401

from app.schemas.backtest import StrategyConfig
from app.strategies.montecarlo import (
    _bands,
    block_indices,
    checkpoints_of,
    default_block_length,
    run_paths,
    seed_of,
    shapes_of,
    synthetic_frame,
)

START = datetime(2024, 3, 1, tzinfo=UTC)
CONFIG = StrategyConfig.model_validate(STRATEGY)


def frame():
    return candles("1d", datetime(2024, 1, 1, tzinfo=UTC), datetime(2024, 7, 1, tzinfo=UTC))


def first_of(df):
    return int(df.index.searchsorted(pd.Timestamp(START)))


def test_block_indices_are_made_of_consecutive_candles():
    rng = np.random.default_rng(1)
    picks = block_indices(rng, 100, 10)
    assert len(picks) == 100
    assert picks.min() >= 0 and picks.max() < 100
    for at in range(0, 100, 10):
        block = picks[at : at + 10]
        assert (np.diff(block) % 100 == 1).all()


def test_the_default_block_is_about_the_square_root():
    assert default_block_length(10_000) == 100
    assert default_block_length(30) == 5
    assert default_block_length(2) == 2


def test_picking_every_candle_in_order_gives_back_the_range():
    df = frame()
    first = first_of(df)
    shapes = shapes_of(df, first)
    same = synthetic_frame(df, first, shapes, np.arange(len(df) - first))
    np.testing.assert_allclose(same.close.to_numpy(), df.close.to_numpy(), rtol=1e-9)
    np.testing.assert_allclose(same.open.to_numpy(), df.open.to_numpy(), rtol=1e-9)


def test_synthetic_candles_stay_coherent_and_keep_the_warmup():
    df = frame()
    first = first_of(df)
    shapes = shapes_of(df, first)
    picks = block_indices(np.random.default_rng(7), len(df) - first, 12)
    fake = synthetic_frame(df, first, shapes, picks)
    assert len(fake) == len(df)
    assert fake.index.equals(df.index)
    assert fake.iloc[:first].equals(df.iloc[:first])
    assert (fake.high >= fake[["open", "close"]].max(axis=1) - 1e-9).all()
    assert (fake.low <= fake[["open", "close"]].min(axis=1) + 1e-9).all()
    assert (fake.close > 0).all()
    # It is a different history, not the real one.
    assert not np.allclose(fake.close.to_numpy()[first:], df.close.to_numpy()[first:])


def test_percentile_bands_of_a_known_case():
    # 101 paths that are constant: path k sits at k, so the p-th percentile is p.
    curves = np.tile(np.arange(101, dtype=float)[:, None], (1, 4))
    bands = _bands(curves)
    assert bands.p5 == [5.0] * 4
    assert bands.p25 == [25.0] * 4
    assert bands.p50 == [50.0] * 4
    assert bands.p75 == [75.0] * 4
    assert bands.p95 == [95.0] * 4


def test_checkpoints_grow_up_to_all_the_paths():
    steps = checkpoints_of(200)
    assert steps == sorted(set(steps))
    assert steps[-1] == 200 and steps[0] >= 2
    assert checkpoints_of(10)[-1] == 10


def test_the_same_seed_gives_the_same_result():
    df = frame()
    a = run_paths(df, CONFIG, "1d", START, 30, None, 123)
    b = run_paths(df, CONFIG, "1d", START, 30, None, 123)
    c = run_paths(df, CONFIG, "1d", START, 30, None, 124)
    assert a == b
    assert a.returns != c.returns


def test_the_result_is_aggregated():
    df = frame()
    result = run_paths(df, CONFIG, "1d", START, 30, 6, 5)
    n = result.candle_count
    points = min(160, n + 1)
    assert result.runs == 30 and result.block_length == 6
    assert len(result.returns) == len(result.drawdowns) == 30
    assert len(result.samples) == 30 and all(len(s) == points for s in result.samples)
    assert len(result.real.curve) == points
    assert [len(getattr(result.bands, f"p{p}")) for p in (5, 25, 50, 75, 95)] == [points] * 5
    assert result.checkpoints[-1].runs == 30
    assert result.checkpoints[-1].bands == result.bands
    # The bands are ordered at every point, and every path starts at 100.
    for lo, hi in (("p5", "p25"), ("p25", "p50"), ("p50", "p75"), ("p75", "p95")):
        assert all(a <= b for a, b in zip(getattr(result.bands, lo), getattr(result.bands, hi)))
    assert all(s[0] == pytest.approx(100) for s in result.samples)
    assert 0 <= result.beat_hold_pct <= 100


def test_seed_of_depends_on_the_request():
    assert seed_of({"a": 1}) == seed_of({"a": 1})
    assert seed_of({"a": 1}) != seed_of({"a": 2})


# --- endpoint -------------------------------------------------------------------------------


def paths(client, **over):  # noqa: F811
    return batch(client, kind="mc-paths", paths=20, **over)


def test_the_endpoint_returns_the_aggregate_and_is_repeatable(client):  # noqa: F811
    first = paths(client)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["kind"] == "mc-paths" and body["runs"] == 20
    assert len(body["returns"]) == 20 and len(body["samples"]) == 20
    assert body["real"]["returnPct"] == pytest.approx(
        batch(client, kind="windows", lengthDays=182, stepDays=1).json()["items"][0]["summary"][
            "returnPct"
        ],
        abs=0.01,
    )
    assert paths(client).json() == body
    assert paths(client, seed=9).json()["returns"] != body["returns"]


def test_the_endpoint_refuses_what_is_too_much(client):  # noqa: F811
    assert batch(client, kind="mc-paths", paths=5).status_code == 422
    assert batch(client, kind="mc-paths", paths=1001).status_code == 422
    assert paths(client, blockLength=100_000).status_code == 422
    huge = batch(
        client,
        kind="mc-paths",
        paths=50,
        timeframe="1h",
        **{"from": "2020-01-01", "to": "2024-06-30"},
    )
    assert huge.status_code == 422
    short = paths(client, **{"from": "2024-06-01", "to": "2024-06-10"})
    assert short.status_code == 422
