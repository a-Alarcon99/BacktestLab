"""Candlestick pattern detectors, used by the `candle-pattern` condition.

Every detector takes the OHLC frame and returns a boolean Series that is True on the **last**
candle of the pattern (the one whose close completes it), so a signal never looks ahead. Multi-
candle patterns read the previous candles with `shift(k)`, oldest first (k = n-1 ... 0).

Definitions use these per-candle measures: `body = |close - open|`, `range = high - low`,
`upper = high - max(open, close)`, `lower = min(open, close) - low`.

Simplifications (crypto trades 24/7, so true gaps are rare and the classic definitions are relaxed):

- **Trend context**: a reversal needs something to reverse. The pattern must be preceded by a
  downtrend (bullish) or an uptrend (bearish): the close right before the pattern is lower
  (higher) than the close `TREND_LOOKBACK` candles earlier.
- **Gaps**: "gap down/up" is relaxed to "opens at or beyond the previous close".
- **Tolerances**: a "long" body is >= `LONG_BODY` of the candle's range, a "small" body is
  <= `SMALL_BODY` of the first candle's body, a "long" wick is >= 2x the body and >= 60 % of the
  range, a "short" wick is <= 10 % of the range (<= 35 % of the body in the 3-candle patterns).
- Candles with zero range never match.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import pandas as pd

TREND_LOOKBACK = 5
LONG_BODY = 0.6
SMALL_BODY = 0.5
LONG_WICK_RANGE = 0.6
SHORT_WICK_RANGE = 0.1
SHORT_WICK_BODY = 0.35

Bias = Literal["bullish", "bearish"]


@dataclass(frozen=True)
class PatternSpec:
    bias: Bias
    candles: int
    detect: Callable[[pd.DataFrame], pd.Series]


class _Candle:
    """OHLC measures of the candle `k` positions before the current one."""

    def __init__(self, df: pd.DataFrame, k: int) -> None:
        self.open, self.high = df.open.shift(k), df.high.shift(k)
        self.low, self.close = df.low.shift(k), df.close.shift(k)
        self.body = (self.close - self.open).abs()
        self.range = self.high - self.low
        top = self.open.where(self.open > self.close, self.close)
        bottom = self.open.where(self.open < self.close, self.close)
        self.upper = self.high - top
        self.lower = bottom - self.low
        self.bullish = self.close > self.open
        self.bearish = self.close < self.open
        self.valid = self.range > 0
        self.mid = (self.open + self.close) / 2

    @property
    def long_body(self) -> pd.Series:
        return self.valid & (self.body >= LONG_BODY * self.range)


def _downtrend(df: pd.DataFrame, before: int) -> pd.Series:
    """Close before the pattern's first candle (`before` candles back) is below the one
    `TREND_LOOKBACK` earlier."""
    return df.close.shift(before) < df.close.shift(before + TREND_LOOKBACK)


def _uptrend(df: pd.DataFrame, before: int) -> pd.Series:
    return df.close.shift(before) > df.close.shift(before + TREND_LOOKBACK)


def _hammer(df: pd.DataFrame) -> pd.Series:
    c = _Candle(df, 0)
    return (
        c.valid
        & (c.lower >= 2 * c.body)
        & (c.lower >= LONG_WICK_RANGE * c.range)
        & (c.upper <= SHORT_WICK_RANGE * c.range)
        & _downtrend(df, 1)
    )


def _shooting_star(df: pd.DataFrame) -> pd.Series:
    c = _Candle(df, 0)
    return (
        c.valid
        & (c.upper >= 2 * c.body)
        & (c.upper >= LONG_WICK_RANGE * c.range)
        & (c.lower <= SHORT_WICK_RANGE * c.range)
        & _uptrend(df, 1)
    )


def _bullish_engulfing(df: pd.DataFrame) -> pd.Series:
    prev, cur = _Candle(df, 1), _Candle(df, 0)
    return (
        prev.valid
        & cur.valid
        & prev.bearish
        & cur.bullish
        & (cur.open <= prev.close)
        & (cur.close >= prev.open)
        & (cur.body > prev.body)
        & _downtrend(df, 2)
    )


def _bearish_engulfing(df: pd.DataFrame) -> pd.Series:
    prev, cur = _Candle(df, 1), _Candle(df, 0)
    return (
        prev.valid
        & cur.valid
        & prev.bullish
        & cur.bearish
        & (cur.open >= prev.close)
        & (cur.close <= prev.open)
        & (cur.body > prev.body)
        & _uptrend(df, 2)
    )


def _morning_star(df: pd.DataFrame) -> pd.Series:
    first, star, last = _Candle(df, 2), _Candle(df, 1), _Candle(df, 0)
    star_top = star.open.where(star.open > star.close, star.close)
    return (
        first.long_body
        & first.bearish
        & star.valid
        & (star.body <= SMALL_BODY * first.body)
        & (star_top <= first.close)
        & last.valid
        & last.bullish
        & (last.close > first.mid)
        & _downtrend(df, 3)
    )


def _evening_star(df: pd.DataFrame) -> pd.Series:
    first, star, last = _Candle(df, 2), _Candle(df, 1), _Candle(df, 0)
    star_bottom = star.open.where(star.open < star.close, star.close)
    return (
        first.long_body
        & first.bullish
        & star.valid
        & (star.body <= SMALL_BODY * first.body)
        & (star_bottom >= first.close)
        & last.valid
        & last.bearish
        & (last.close < first.mid)
        & _uptrend(df, 3)
    )


def _piercing_line(df: pd.DataFrame) -> pd.Series:
    first, second = _Candle(df, 1), _Candle(df, 0)
    return (
        first.long_body
        & first.bearish
        & second.valid
        & second.bullish
        & (second.open <= first.close)
        & (second.close > first.mid)
        & (second.close < first.open)
        & _downtrend(df, 2)
    )


def _dark_cloud_cover(df: pd.DataFrame) -> pd.Series:
    first, second = _Candle(df, 1), _Candle(df, 0)
    return (
        first.long_body
        & first.bullish
        & second.valid
        & second.bearish
        & (second.open >= first.close)
        & (second.close < first.mid)
        & (second.close > first.open)
        & _uptrend(df, 2)
    )


def _three_white_soldiers(df: pd.DataFrame) -> pd.Series:
    a, b, c = _Candle(df, 2), _Candle(df, 1), _Candle(df, 0)
    result = _downtrend(df, 3)
    for candle in (a, b, c):
        result &= (
            candle.long_body & candle.bullish & (candle.upper <= SHORT_WICK_BODY * candle.body)
        )
    for prev, cur in ((a, b), (b, c)):
        # Opens inside the previous body and closes higher.
        result &= (cur.open >= prev.open) & (cur.open <= prev.close) & (cur.close > prev.close)
    return result


def _three_black_crows(df: pd.DataFrame) -> pd.Series:
    a, b, c = _Candle(df, 2), _Candle(df, 1), _Candle(df, 0)
    result = _uptrend(df, 3)
    for candle in (a, b, c):
        result &= (
            candle.long_body & candle.bearish & (candle.lower <= SHORT_WICK_BODY * candle.body)
        )
    for prev, cur in ((a, b), (b, c)):
        result &= (cur.open <= prev.open) & (cur.open >= prev.close) & (cur.close < prev.close)
    return result


PATTERNS: dict[str, PatternSpec] = {
    "hammer": PatternSpec("bullish", 1, _hammer),
    "bullish-engulfing": PatternSpec("bullish", 2, _bullish_engulfing),
    "morning-star": PatternSpec("bullish", 3, _morning_star),
    "piercing-line": PatternSpec("bullish", 2, _piercing_line),
    "three-white-soldiers": PatternSpec("bullish", 3, _three_white_soldiers),
    "shooting-star": PatternSpec("bearish", 1, _shooting_star),
    "bearish-engulfing": PatternSpec("bearish", 2, _bearish_engulfing),
    "evening-star": PatternSpec("bearish", 3, _evening_star),
    "dark-cloud-cover": PatternSpec("bearish", 2, _dark_cloud_cover),
    "three-black-crows": PatternSpec("bearish", 3, _three_black_crows),
}


def warmup(pattern: str) -> int:
    """Candles before the first valid signal: the pattern itself plus the trend lookback."""
    return PATTERNS[pattern].candles + TREND_LOOKBACK
