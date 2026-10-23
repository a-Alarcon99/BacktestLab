from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest

from app.schemas.backtest import StrategyConfig
from app.strategies import analytics
from app.strategies.engine import simulate, to_result

START = datetime(2026, 1, 1, tzinfo=UTC)


def candles(closes, freq: str = "1D") -> pd.DataFrame:
    index = pd.date_range(START, periods=len(closes), freq=freq, tz=UTC, name="open_time")
    close = pd.Series(closes, index=index, dtype=float)
    return pd.DataFrame(
        {"open": close, "high": close + 1, "low": close - 1, "close": close, "volume": 100.0}
    )


def strategy(*rules: dict, fee: float = 0) -> StrategyConfig:
    return StrategyConfig.model_validate(
        {
            "initialCapital": 1000,
            "feePct": fee,
            "rules": [{"id": f"r{i}", **r} for i, r in enumerate(rules)],
        }
    )


def rule(side: str, *conditions: dict, size: float = 100) -> dict:
    return {"side": side, "conditions": list(conditions), "size": {"unit": "pct", "value": size}}


def change(direction: str, pct: float, lookback: int | str = 1) -> dict:
    return {"kind": "price-change", "direction": direction, "pct": pct, "lookback": lookback}


def rsi(op: str, value: float) -> dict:
    return {"kind": "rsi", "period": 14, "op": op, "value": value}


DIP_RALLY = strategy(rule("buy", change("down", 5)), rule("sell", change("up", 20, "entry")))


def test_benchmark_buys_at_the_first_open_with_fees():
    sim = simulate(
        candles([100, 110, 120]), strategy(rule("buy", rsi("below", 1)), fee=1), START, "1d"
    )
    assert sim.benchmark == pytest.approx(1000 * 0.99 / 100 * np.array([100, 110, 120]) * 0.99)
    assert sim.stats.benchmark_return_pct == pytest.approx(
        (1000 * 0.99 * 1.2 * 0.99 / 1000 - 1) * 100
    )


def test_drawdown_series():
    dd = analytics.drawdown_series(np.array([100, 120, 90, 120, 130, 100.0]))
    assert dd == pytest.approx([0, 0, 25, 0, 0, 30 / 130 * 100])


def test_longest_drawdown_recovered():
    values = np.array([100, 120, 90, 100, 120, 130, 110.0])
    times = pd.date_range(START, periods=6, freq="1D", tz=UTC)
    period = analytics.longest_drawdown(values, times, 86_400, np.arange(6))
    assert period is not None
    assert (period.candles, period.recovered) == (3, True)
    assert period.seconds == 3 * 86_400
    assert period.depth_pct == pytest.approx(25)


def test_longest_drawdown_not_recovered():
    values = np.array([100, 90, 80, 85.0])
    times = pd.date_range(START, periods=3, freq="1D", tz=UTC)
    period = analytics.longest_drawdown(values, times, 86_400, np.arange(3))
    assert period is not None
    assert (period.candles, period.recovered) == (3, False)
    assert (period.start_index, period.end_index) == (0, 2)
    assert period.seconds == 3 * 86_400
    assert period.depth_pct == pytest.approx(20)


def test_no_drawdown():
    values = np.array([100, 110, 120.0])
    times = pd.date_range(START, periods=2, freq="1D", tz=UTC)
    assert analytics.longest_drawdown(values, times, 86_400, np.arange(2)) is None


def test_single_winning_trade():
    result = to_result(simulate(candles([100, 90, 95, 120, 125]), DIP_RALLY, START, "1d"))
    (trip,) = result.round_trips
    assert (trip.entry_index, trip.exit_index, trip.bars) == (2, 4, 2)
    assert trip.entry_price == pytest.approx(95)
    assert trip.exit_price == pytest.approx(125)
    assert trip.pnl_pct == pytest.approx((125 / 95 - 1) * 100)
    assert trip.duration_seconds == 2 * 86_400
    assert trip.worst_pct == pytest.approx((94 / 95 - 1) * 100)  # lows are close - 1
    assert not trip.open
    m = result.metrics
    assert (m.round_trips, m.wins, m.losses) == (1, 1, 0)
    assert m.profit_factor is None and m.payoff_ratio is None and m.avg_loss_pct is None
    assert m.best_trade_share_pct == pytest.approx(100)
    assert m.exposure_pct == pytest.approx(40)  # held at the closes of candles 2 and 3
    assert m.cagr_pct is None  # 5 days: too short to annualize


def test_open_trade_is_valued_at_the_last_close():
    sim = simulate(candles([100, 90, 95, 100]), DIP_RALLY, START, "1d")
    result = to_result(sim)
    (trip,) = result.round_trips
    assert trip.open and trip.exit_time is None and trip.exit_rule_id is None
    assert trip.pnl == pytest.approx(sim.stats.final_capital - 1000)
    assert result.metrics.round_trips == 0
    assert result.metrics.expectancy_pct is None


def test_streaks():
    assert analytics._streaks([True, True, False, False, False, True]) == (2, 3)
    assert analytics._streaks([]) == (0, 0)


def random_walk(n: int, seed: int = 1, freq: str = "1h") -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    df = candles(closes, freq)
    df["open"] = np.concatenate([[closes[0]], closes[:-1]])
    df["high"] = np.maximum(df.open, df.close) * 1.002
    df["low"] = np.minimum(df.open, df.close) * 0.998
    return df


MIXED = strategy(
    rule("buy", rsi("below", 40), size=50),
    rule("sell", rsi("above", 60), size=50),
    rule("sell", change("down", 5, "entry")),
    fee=0.1,
)


def test_report_figures_add_up():
    sim = simulate(random_walk(3000), MIXED, START, "1h")
    result = to_result(sim)
    trips = result.round_trips
    assert len(trips) > 5
    # Every trade's result together is exactly the final result.
    assert sum(t.pnl for t in trips) == pytest.approx(sim.stats.final_capital - 1000)
    assert result.equity[-1] == pytest.approx(sim.stats.final_capital)
    assert result.metrics.round_trips == sim.stats.round_trips
    assert sum(t.round_trip is not None for t in result.trades) == len(result.trades)
    # Merged candles keep the deepest fall inside them.
    full = analytics.drawdown_series(np.concatenate([[1000], sim.equity]))[1:]
    assert max(result.drawdown) == pytest.approx(full.max())
    assert max(result.drawdown) == pytest.approx(sim.stats.max_drawdown_pct)
    assert result.metrics.wins + result.metrics.losses == result.metrics.round_trips
    assert result.metrics.fees_paid > 0


def test_period_returns_compound_to_the_total():
    sim = simulate(random_walk(3000), MIXED, START, "1h")
    periods = to_result(sim).periods
    assert periods.unit == "week"  # 125 days -> 18 weeks
    total = np.prod([1 + p.return_pct / 100 for p in periods.items])
    assert total == pytest.approx(sim.stats.final_capital / 1000)
    bench = np.prod([1 + p.benchmark_pct / 100 for p in periods.items])
    assert bench == pytest.approx(sim.benchmark[-1] / 1000)


@pytest.mark.parametrize(
    ("days", "freq", "unit"),
    [(20, "1D", "day"), (100, "1D", "week"), (400, "1D", "month"), (1500, "1D", "quarter")],
)
def test_period_unit(days: int, freq: str, unit: str):
    sim = simulate(random_walk(days, freq=freq), MIXED, START, "1d")
    assert analytics.period_returns(sim, days).unit == unit


def test_weekly_candles_never_get_daily_periods():
    sim = simulate(random_walk(10, freq="7D"), MIXED, START, "1w")
    assert analytics.period_returns(sim, 70).unit == "week"
