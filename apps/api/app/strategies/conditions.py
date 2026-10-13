"""Registry of the condition kinds a strategy rule can use.

Adding a condition kind = a pydantic model in `app/schemas/backtest.py` plus one `ConditionSpec`
here (and its counterpart in the web app's `lib/strategy.ts`). Each spec tells:

- `label`/`subject`: what the condition looks at. Two conditions with the same subject (same
  indicator and parameters) are compared to detect contradictions.
- `constraint`: the values it accepts on that subject, as an open `Interval` (threshold
  conditions) or a `Choice` (events: two different choices can't happen on the same candle).
- `warmup`: candles needed before its first valid value.
- `evaluate`: boolean Series over the candles; `None` when it depends on the open position and
  the engine evaluates it candle by candle (price change since the entry).
"""

from collections.abc import Callable
from dataclasses import dataclass
from math import inf
from typing import Any

import pandas as pd

from app.schemas.backtest import (
    BollingerCondition,
    Condition,
    DonchianCondition,
    MacdCondition,
    MaCrossCondition,
    PeriodicCondition,
    PriceChangeCondition,
    VolumeCondition,
)
from app.strategies import indicators as ind


@dataclass(frozen=True)
class Interval:
    """Open interval (lo, hi) of accepted values."""

    lo: float
    hi: float

    def intersect(self, other: "Interval") -> "Interval":
        return Interval(max(self.lo, other.lo), min(self.hi, other.hi))

    @property
    def empty(self) -> bool:
        return self.lo >= self.hi


@dataclass(frozen=True)
class Choice:
    value: str


Constraint = Interval | Choice


@dataclass(frozen=True)
class ConditionSpec:
    label: Callable[[Any], str]
    subject: Callable[[Any], str]
    constraint: Callable[[Any], Constraint]
    warmup: Callable[[Any], int]
    evaluate: Callable[[pd.DataFrame, Any], pd.Series | None]


def _threshold(op: str, value: float) -> Interval:
    return Interval(value, inf) if op == "above" else Interval(-inf, value)


def _cross(fast: pd.Series, slow: pd.Series, direction: str) -> pd.Series:
    return ind.crosses_above(fast, slow) if direction == "up" else ind.crosses_below(fast, slow)


def _ma_cross(df: pd.DataFrame, c: MaCrossCondition) -> pd.Series:
    average = ind.sma if c.ma == "sma" else ind.ema
    return _cross(average(df.close, c.fast), average(df.close, c.slow), c.direction)


def _macd(df: pd.DataFrame, c: MacdCondition) -> pd.Series:
    line, signal = ind.macd(df.close, c.fast, c.slow, c.signal)
    return _cross(line, signal, c.direction)


def _bollinger(df: pd.DataFrame, c: BollingerCondition) -> pd.Series:
    lower, upper = ind.bollinger(df.close, c.period, c.std_dev)
    return df.close > upper if c.band == "upper" else df.close < lower


def _donchian(df: pd.DataFrame, c: DonchianCondition) -> pd.Series:
    low, high = ind.donchian(df.high, df.low, c.period)
    return df.close > high if c.direction == "up" else df.close < low


def _price_change(df: pd.DataFrame, c: PriceChangeCondition) -> pd.Series | None:
    if c.lookback == "entry":
        return None
    change = (df.close / df.close.shift(c.lookback) - 1) * 100
    return change > c.pct if c.direction == "up" else change < -c.pct


def _volume(df: pd.DataFrame, c: VolumeCondition) -> pd.Series:
    # Compared with the average of the previous candles, so a spike doesn't raise its own bar.
    ratio = df.volume / ind.sma(df.volume, c.period).shift(1)
    return ratio > c.multiple if c.op == "above" else ratio < c.multiple


def _periodic(df: pd.DataFrame, c: PeriodicCondition) -> pd.Series:
    """True on the first candle of each day, week (Monday) or month."""
    index = df.index
    match c.every:
        case "day":
            key = index.normalize()
        case "week":
            key = index.normalize() - pd.to_timedelta(index.weekday, unit="D")
        case "month":
            key = index.year * 12 + index.month
    period = pd.Series(key, index=index)
    return period.ne(period.shift(1))


def entry_change_matches(c: PriceChangeCondition, change_pct: float) -> bool:
    """`change_pct`: change of the close vs. the average entry price, in %."""
    return change_pct > c.pct if c.direction == "up" else change_pct < -c.pct


SPECS: dict[str, ConditionSpec] = {
    "rsi": ConditionSpec(
        label=lambda c: f"RSI ({c.period})",
        subject=lambda c: f"rsi:{c.period}",
        constraint=lambda c: _threshold(c.op, c.value),
        # Wilder smoothing needs a few periods to converge.
        warmup=lambda c: c.period * 4,
        evaluate=lambda df, c: (
            ind.rsi(df.close, c.period) > c.value
            if c.op == "above"
            else ind.rsi(df.close, c.period) < c.value
        ),
    ),
    "ma-cross": ConditionSpec(
        label=lambda c: f"cruce {c.ma.upper()} {c.fast}/{c.slow}",
        subject=lambda c: f"{c.ma}-cross:{c.fast}:{c.slow}",
        constraint=lambda c: Choice(c.direction),
        warmup=lambda c: (c.slow if c.ma == "sma" else c.slow * 3) + 1,
        evaluate=_ma_cross,
    ),
    "macd": ConditionSpec(
        label=lambda c: f"MACD ({c.fast}, {c.slow}, {c.signal})",
        subject=lambda c: f"macd:{c.fast}:{c.slow}:{c.signal}",
        constraint=lambda c: Choice(c.direction),
        warmup=lambda c: (c.slow + c.signal) * 3 + 1,
        evaluate=_macd,
    ),
    "bollinger": ConditionSpec(
        label=lambda c: f"Bollinger ({c.period}, {c.std_dev:g})",
        subject=lambda c: f"bollinger:{c.period}:{c.std_dev:g}",
        constraint=lambda c: Choice(c.band),
        warmup=lambda c: c.period,
        evaluate=_bollinger,
    ),
    "donchian": ConditionSpec(
        label=lambda c: f"Donchian ({c.period})",
        subject=lambda c: f"donchian:{c.period}",
        constraint=lambda c: Choice(c.direction),
        warmup=lambda c: c.period + 1,
        evaluate=_donchian,
    ),
    "price-change": ConditionSpec(
        label=lambda c: (
            "precio desde la compra" if c.lookback == "entry" else f"precio en {c.lookback} velas"
        ),
        subject=lambda c: f"price-change:{c.lookback}",
        constraint=lambda c: (
            Interval(c.pct, inf) if c.direction == "up" else Interval(-inf, -c.pct)
        ),
        warmup=lambda c: 0 if c.lookback == "entry" else c.lookback,
        evaluate=_price_change,
    ),
    "volume": ConditionSpec(
        label=lambda c: f"volumen (media {c.period})",
        subject=lambda c: f"volume:{c.period}",
        constraint=lambda c: _threshold(c.op, c.multiple),
        warmup=lambda c: c.period + 1,
        evaluate=_volume,
    ),
    "periodic": ConditionSpec(
        label=lambda c: {"day": "cada día", "week": "cada semana", "month": "cada mes"}[c.every],
        subject=lambda c: f"periodic:{c.every}",
        constraint=lambda c: Choice("on"),
        warmup=lambda c: 1,
        evaluate=_periodic,
    ),
}


def spec(condition: Condition) -> ConditionSpec:
    return SPECS[condition.kind]
