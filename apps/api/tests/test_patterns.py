import typing

import pandas as pd
import pytest

from app.schemas.backtest import PatternId
from app.strategies.conditions import PATTERN_LABELS
from app.strategies.patterns import PATTERNS

# Six falling closes (downtrend) or rising closes (uptrend) precede each pattern.
DOWN = [(110 - i, 110 - i + 0.5, 110 - i - 1.5, 110 - i - 1) for i in range(6)]  # o, h, l, c
UP = [(100 + i, 100 + i + 1.5, 100 + i - 0.5, 100 + i + 1) for i in range(6)]


def frame(prefix: list[tuple], pattern: list[tuple]) -> pd.DataFrame:
    rows = prefix + pattern
    index = pd.date_range("2026-01-01", periods=len(rows), freq="1D", tz="UTC")
    return pd.DataFrame(rows, columns=["open", "high", "low", "close"], index=index)


# (pattern, prefix, candles as (open, high, low, close)); close of DOWN ends at 104, UP at 106.
CASES = {
    "hammer": (DOWN, [(104, 104.1, 100, 103.8)]),
    "bullish-engulfing": (DOWN, [(104, 104.2, 101.8, 102), (101.5, 106, 101, 105.5)]),
    "morning-star": (
        DOWN,
        [(104, 104.2, 97.8, 98), (97.5, 98, 96.5, 97.6), (97.8, 103.5, 97.5, 103)],
    ),
    "piercing-line": (DOWN, [(104, 104.2, 97.8, 98), (97.5, 102.5, 97, 102)]),
    "three-white-soldiers": (
        DOWN,
        [(104, 106.1, 103.9, 106), (105, 108.1, 104.9, 108), (107, 110.1, 106.9, 110)],
    ),
    "shooting-star": (UP, [(106, 110, 105.9, 106.2)]),
    "bearish-engulfing": (UP, [(106, 108.2, 105.8, 108), (108.5, 109, 104, 104.5)]),
    "evening-star": (
        UP,
        [(106, 112.2, 105.8, 112), (112.5, 113.5, 112, 112.4), (112.2, 112.5, 106, 106.5)],
    ),
    "dark-cloud-cover": (UP, [(106, 112.2, 105.8, 112), (112.5, 113, 108, 108.5)]),
    "three-black-crows": (
        UP,
        [(106, 106.1, 103.9, 104), (105, 105.1, 101.9, 102), (103, 103.1, 99.9, 100)],
    ),
}


def test_pattern_ids_are_in_sync():
    ids = set(typing.get_args(PatternId))
    assert ids == set(PATTERNS) == set(PATTERN_LABELS) == set(CASES)
    assert sum(p.bias == "bullish" for p in PATTERNS.values()) == 5


@pytest.mark.parametrize("name", CASES)
def test_detects_on_last_candle_only(name: str):
    prefix, candles = CASES[name]
    df = frame(prefix, candles)
    signal = PATTERNS[name].detect(df)
    assert bool(signal.iloc[-1])
    assert not signal.iloc[:-1].any()


@pytest.mark.parametrize("name", CASES)
def test_needs_the_prior_trend(name: str):
    prefix, candles = CASES[name]
    flat = [(100.0, 100.5, 99.5, 100.0)] * len(prefix)
    # Rebase the pattern so the shape stays the same relative to the (flat) context.
    shift = 100.0 - prefix[-1][3]
    moved = [tuple(v + shift for v in c) for c in candles]
    assert not PATTERNS[name].detect(frame(flat, moved)).iloc[-1]


def test_hammer_is_not_a_shooting_star():
    prefix, candles = CASES["hammer"]
    df = frame(prefix, candles)
    assert not PATTERNS["shooting-star"].detect(df).iloc[-1]
