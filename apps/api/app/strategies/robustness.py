"""Robustness tests: many simulations of one strategy over the same candles.

Every test is a list of variants run by `run_many` on a DataFrame read once:

- windows: the same strategy restarted (full capital) on each slice of the range;
- sensitivity: the strategy with one or two parameters varied around their values;
- timeframes: the same range on neighbouring timeframes (one `run_many` call per timeframe, since
  each needs its own candles).

A variant is simulated exactly as a direct backtest of its slice would be (same warm-up rule), so
the result of a window equals running that window on its own.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from math import floor

import numpy as np
import pandas as pd
from pydantic import ValidationError

from app.schemas.backtest import (
    OrderMark,
    PricePoint,
    RunSummary,
    SensitivityAxis,
    StrategyConfig,
)
from app.services.candles import TIMEFRAME_SPAN, TIMEFRAMES, InvalidRangeError, Timeframe
from app.strategies.analytics import drawdown_series, round_trips
from app.strategies.conditions import spec
from app.strategies.engine import Simulation, simulate, warmup_candles

# Relative steps of a parameter around its value: ±20 % in 10 % steps (5 levels per axis).
LEVELS: tuple[float, ...] = (-0.2, -0.1, 0.0, 0.1, 0.2)
# The user may type each of the values of a parameter instead of using those levels.
# Parameters varied at once (a grid of LEVELS ** axes cells: at most 25 simulations).
MAX_AXES = 2
# Points of the curves sent with each summary.
CURVE_POINTS = 48
# Orders sent with each summary, to mark them on the curves.
MAX_MARKS = 60
# Points of the price line drawn behind the windows.
PRICE_POINTS = 160
# A window or timeframe needs this many candles to say anything.
MIN_CANDLES = 10
# Neighbouring timeframes on each side of the one asked for.
TIMEFRAME_REACH = 2


# --- Windows ------------------------------------------------------------------------------------


def window_bounds(
    from_: date, to: date, length_days: int, step_days: int
) -> list[tuple[date, date]]:
    """Inclusive (start, end) days of each window that fits in [from_, to]."""
    windows = []
    start = from_
    while True:
        end = start + timedelta(days=length_days - 1)
        if end > to:
            break
        windows.append((start, end))
        start += timedelta(days=step_days)
    return windows


# --- Sensitivity --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Param:
    id: str
    rule_index: int
    condition_index: int
    kind: str
    field: str
    base: float
    lo: float
    hi: float
    integer: bool


def tunables(strategy: StrategyConfig) -> list[Param]:
    """Numeric parameters of the strategy's conditions, in rule order (ids are positions)."""
    found = []
    for r, rule in enumerate(strategy.rules):
        for c, condition in enumerate(rule.conditions):
            for tunable in spec(condition).params:
                value = getattr(condition, tunable.field)
                if isinstance(value, bool) or not isinstance(value, int | float):
                    continue  # e.g. a price change measured "since the entry"
                found.append(
                    Param(
                        id=f"{r}:{c}:{tunable.field}",
                        rule_index=r,
                        condition_index=c,
                        kind=condition.kind,
                        field=tunable.field,
                        base=float(value),
                        lo=tunable.lo,
                        hi=tunable.hi,
                        integer=tunable.integer,
                    )
                )
    return found


def fit_value(param: Param, value: float) -> float:
    """A value kept inside what the parameter accepts, rounded."""
    value = min(max(value, param.lo), param.hi)
    # Halves round up (not to even) to match the web app's preview of these values.
    return float(floor(value + 0.5)) if param.integer else round(value, 2)


def level_values(param: Param) -> list[float]:
    """The value of the parameter at each level, rounded and kept inside what it accepts."""
    return [fit_value(param, param.base * (1 + level)) for level in LEVELS]


def axis_of(param: Param, chosen: list[float] | None = None) -> SensitivityAxis:
    """The axis of a parameter: the usual levels, or the values the user typed."""
    values = level_values(param) if chosen is None else [fit_value(param, v) for v in chosen]
    levels = [v / param.base - 1 if param.base else 0.0 for v in values]
    return SensitivityAxis(
        id=param.id,
        kind=param.kind,
        field=param.field,
        rule_index=param.rule_index,
        condition_index=param.condition_index,
        base=param.base,
        values=values,
        levels=levels,
    )


def vary(strategy: StrategyConfig, changes: list[tuple[Param, float]]) -> StrategyConfig | None:
    """The strategy with those parameters set, or None when a condition no longer validates.

    All the changes of one condition apply together, so a pair like fast/slow is checked as a
    whole and not after the first of them.
    """
    edits: dict[tuple[int, int], dict[str, float]] = {}
    for param, value in changes:
        value = int(value) if param.integer else value
        edits.setdefault((param.rule_index, param.condition_index), {})[param.field] = value
    rules = list(strategy.rules)
    try:
        for (r, c), fields in edits.items():
            rule = rules[r]
            condition = rule.conditions[c]
            conditions = list(rule.conditions)
            conditions[c] = type(condition).model_validate({**condition.model_dump(), **fields})
            rules[r] = rule.model_copy(update={"conditions": conditions})
    except ValidationError:
        return None
    return strategy.model_copy(update={"rules": rules})


# --- Timeframes ---------------------------------------------------------------------------------


def estimate_candles(from_: date, to: date, timeframe: Timeframe) -> float:
    return ((to - from_).days + 1) * 86_400 / TIMEFRAME_SPAN[timeframe].total_seconds()


def neighbor_timeframes(
    timeframe: Timeframe, from_: date, to: date, max_candles: int
) -> list[Timeframe]:
    """The timeframe and its neighbours in `TIMEFRAMES` that suit the range.

    A neighbour needs at least MIN_CANDLES candles in the range and at most `max_candles` (the
    limit of one backtest); the timeframe asked for is always kept.
    """
    at = TIMEFRAMES.index(timeframe)
    near = TIMEFRAMES[max(0, at - TIMEFRAME_REACH) : at + TIMEFRAME_REACH + 1]
    return [
        tf
        for tf in near
        if tf == timeframe or MIN_CANDLES <= estimate_candles(from_, to, tf) <= max_candles
    ]


def chosen_timeframes(
    timeframe: Timeframe,
    requested: list[Timeframe] | None,
    from_: date,
    to: date,
    max_candles: int,
) -> list[Timeframe]:
    """The timeframes to compare, in `TIMEFRAMES` order: the asked one plus `requested`.

    Without `requested` they are the neighbours. A requested timeframe that gives fewer than
    MIN_CANDLES or more than `max_candles` is left out, like a neighbour would be.
    """
    if requested is None:
        return neighbor_timeframes(timeframe, from_, to, max_candles)
    wanted = set(requested) | {timeframe}
    return [
        tf
        for tf in TIMEFRAMES
        if tf in wanted
        and (tf == timeframe or MIN_CANDLES <= estimate_candles(from_, to, tf) <= max_candles)
    ]


# --- Running ------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Variant:
    strategy: StrategyConfig
    # First day of the run and exclusive end (None = up to the last candle of the data).
    start: datetime
    end: datetime | None = None


def run_many(
    df: pd.DataFrame, timeframe: Timeframe, variants: list[Variant]
) -> list[Simulation | None]:
    """Simulates every variant on slices of `df` (read once, with warm-up before the first start).

    Each variant sees the candles from its own warm-up to its end, as a direct backtest of that
    range would. A variant without enough candles gives None. Identical variants are run once.
    """
    span = TIMEFRAME_SPAN[timeframe]
    done: dict[tuple, Simulation | None] = {}
    out: list[Simulation | None] = []
    for v in variants:
        key = (v.strategy.model_dump_json(), v.start, v.end)
        if key not in done:
            begin = max(v.start - warmup_candles(v.strategy) * span, df.index[0])
            view = df[(df.index >= begin) & (df.index < v.end)] if v.end else df[df.index >= begin]
            try:
                done[key] = simulate(view, v.strategy, v.start, timeframe)
            except InvalidRangeError:
                done[key] = None
        out.append(done[key])
    return out


def _spaced(values: np.ndarray, points: int) -> np.ndarray:
    index = np.linspace(0, len(values) - 1, min(points, len(values))).round().astype(int)
    return values[index]


def _marks(sim: Simulation) -> list[OrderMark]:
    n = len(sim.times)
    marks = [OrderMark(at=t["i"] / n, side=t["side"]) for t in sim.trades]
    if len(marks) > MAX_MARKS:
        marks = [marks[i] for i in np.linspace(0, len(marks) - 1, MAX_MARKS).round().astype(int)]
    return marks


def summarize(sim: Simulation) -> RunSummary:
    """Figures and short curves of a simulation (no replay data)."""
    stats = sim.stats
    values = np.concatenate([[sim.capital], sim.equity])
    equity = values / sim.capital * 100
    hold = np.concatenate([[sim.capital], sim.benchmark]) / sim.capital * 100
    trips = [t for t in round_trips(sim, np.arange(len(sim.times))) if not t.open]
    gross_win = sum(t.pnl for t in trips if t.pnl > 0)
    gross_loss = -sum(t.pnl for t in trips if t.pnl < 0)
    pcts = [t.pnl_pct for t in trips]
    return RunSummary(
        final_capital=stats.final_capital,
        profit_factor=gross_win / gross_loss if gross_loss > 0 else None,
        exposure_pct=float(sim.in_market.mean() * 100),
        avg_trade_pct=float(np.mean(pcts)) if pcts else None,
        best_trade_pct=max(pcts) if pcts else None,
        worst_trade_pct=min(pcts) if pcts else None,
        drawdown_curve=_spaced(drawdown_series(values), CURVE_POINTS).tolist(),
        marks=_marks(sim),
        return_pct=stats.return_pct,
        benchmark_return_pct=stats.benchmark_return_pct,
        max_drawdown_pct=stats.max_drawdown_pct,
        orders=stats.trades,
        round_trips=stats.round_trips,
        win_rate_pct=stats.win_rate_pct,
        sharpe=stats.sharpe,
        candle_count=len(sim.times),
        curve=_spaced(equity, CURVE_POINTS).tolist(),
        benchmark_curve=_spaced(hold, CURVE_POINTS).tolist(),
    )


def price_line(df: pd.DataFrame, start: datetime, end: datetime) -> list[PricePoint]:
    """The close over [start, end), thinned to PRICE_POINTS points."""
    view = df[(df.index >= start) & (df.index < end)]
    if view.empty:
        return []
    index = np.linspace(0, len(view) - 1, min(PRICE_POINTS, len(view))).round().astype(int)
    times = view.index.to_pydatetime()
    closes = view.close.to_numpy(dtype=float)
    return [PricePoint(time=times[i], close=closes[i]) for i in index]
