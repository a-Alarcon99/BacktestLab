from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest

from app.schemas.backtest import StrategyConfig
from app.strategies import indicators as ind
from app.strategies.engine import simulate, to_result, warmup_candles
from app.strategies.validation import find_conflicts


def dt(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


START = dt(2026, 1, 1)


def candles(closes: list[float], start: datetime = START, freq: str = "1D") -> pd.DataFrame:
    index = pd.date_range(start, periods=len(closes), freq=freq, tz=UTC, name="open_time")
    close = pd.Series(closes, index=index, dtype=float)
    return pd.DataFrame(
        {"open": close, "high": close + 1, "low": close - 1, "close": close, "volume": 100.0}
    )


def strategy(*rules: dict, capital: float = 1000, fee: float = 0) -> StrategyConfig:
    return StrategyConfig.model_validate(
        {
            "initialCapital": capital,
            "feePct": fee,
            "rules": [{"id": f"r{i}", **rule} for i, rule in enumerate(rules)],
        }
    )


def rule(side: str, *conditions: dict, size: float = 100, unit: str = "pct") -> dict:
    return {"side": side, "conditions": list(conditions), "size": {"unit": unit, "value": size}}


def change(direction: str, pct: float, lookback: int | str = 1) -> dict:
    return {"kind": "price-change", "direction": direction, "pct": pct, "lookback": lookback}


def rsi(op: str, value: float, period: int = 14) -> dict:
    return {"kind": "rsi", "period": period, "op": op, "value": value}


# --- indicators -------------------------------------------------------------------------------


def test_rsi_bounds():
    rising = pd.Series(np.arange(1, 40, dtype=float))
    assert ind.rsi(rising, 14).iloc[-1] == 100
    falling = rising[::-1].reset_index(drop=True)
    assert ind.rsi(falling, 14).iloc[-1] == 0
    assert ind.rsi(rising, 14).iloc[:13].isna().all()


def test_rsi_known_value():
    # Alternating +2/-1 moves: Wilder averages hover around gain 1, loss 0.5 -> RSI ~66.67.
    closes = np.cumsum([0] + [2 if i % 2 == 0 else -1 for i in range(400)]) + 100.0
    assert ind.rsi(pd.Series(closes), 14).iloc[-1] == pytest.approx(66.67, abs=2)


def test_macd_line_is_ema_difference():
    close = pd.Series(np.linspace(100, 200, 100))
    line, signal = ind.macd(close, 12, 26, 9)
    expected = ind.ema(close, 12) - ind.ema(close, 26)
    pd.testing.assert_series_equal(line, expected)
    assert signal.notna().sum() == 100 - 26 - 9 + 2


def test_crosses():
    a = pd.Series([1.0, 2, 3, 2, 1])
    b = pd.Series([2.0, 2, 2, 2, 2])
    assert ind.crosses_above(a, b).tolist() == [False, False, True, False, False]
    assert ind.crosses_below(a, b).tolist() == [False, False, False, False, True]


# --- engine -----------------------------------------------------------------------------------


def test_buy_dip_sell_rally():
    df = candles([100, 90, 95, 120, 125])
    s = strategy(rule("buy", change("down", 5)), rule("sell", change("up", 20, "entry")))
    sim = simulate(df, s, dt(2026, 1, 1), "1d")

    assert [(t["i"], t["side"]) for t in sim.trades] == [(1, "buy"), (3, "sell")]
    assert sim.stats.final_capital == pytest.approx(1000 * 120 / 90)
    assert sim.stats.realized_pnl == pytest.approx(1000 * 120 / 90 - 1000)
    assert sim.stats.win_rate_pct == 100
    assert not sim.stats.open_position
    assert sim.buys.tolist() == [0, 1, 1, 1, 1]
    assert sim.sells.tolist() == [0, 0, 0, 1, 1]


def test_fee_and_partial_sizes():
    df = candles([100, 100, 100, 100])
    s = strategy(
        rule("buy", {"kind": "periodic", "every": "day"}, size=100, unit="usdt"),
        capital=1000,
        fee=1,
    )
    sim = simulate(df, s, dt(2026, 1, 1), "1d")
    assert sim.stats.buys == 4
    # 400 USDT spent, 1% fee lost; nothing sold.
    assert sim.stats.final_capital == pytest.approx(600 + 400 * 0.99)
    assert sim.stats.unrealized_pnl == pytest.approx(-4)
    assert sim.stats.open_position


def test_sell_percent_of_position():
    df = candles([100, 90, 110, 130])
    s = strategy(rule("buy", change("down", 5)), rule("sell", change("up", 10), size=50))
    sim = simulate(df, s, dt(2026, 1, 1), "1d")
    sells = [t for t in sim.trades if t["side"] == "sell"]
    assert len(sells) == 2
    assert sells[1]["quantity"] == pytest.approx(sells[0]["quantity"] / 2)


def test_warmup_candles_are_not_traded():
    df = candles([100, 90, 80, 70, 60])
    s = strategy(rule("buy", change("down", 5)))
    sim = simulate(df, s, dt(2026, 1, 3), "1d")
    assert len(sim.times) == 3
    assert sim.trades[0]["i"] == 0  # first candle of the range, already signalling
    assert warmup_candles(s) == 1


def test_to_result_downsamples():
    df = candles(list(np.linspace(100, 200, 3000)), freq="1h")
    s = strategy(rule("buy", {"kind": "periodic", "every": "day"}, size=10))
    result = to_result(simulate(df, s, dt(2026, 1, 1), "1h"), 1000)
    assert result.candle_count == 3000
    assert len(result.candles) == len(result.equity) == 1500
    assert result.candles[0].open == 100
    assert result.candles[-1].close == 200
    assert all(t.index < 1500 for t in result.trades)
    assert result.equity_curve[0] == 100
    assert len(result.equity_curve) == 24


# --- validation -------------------------------------------------------------------------------


def messages(s: StrategyConfig) -> list[str]:
    return [c.message for c in find_conflicts(s)]


def test_valid_strategy_has_no_conflicts():
    s = strategy(
        rule(
            "buy",
            rsi("below", 30),
            {"kind": "volume", "op": "above", "multiple": 1.5, "period": 20},
        ),
        rule("sell", rsi("above", 70)),
        rule("sell", change("down", 10, "entry")),
    )
    assert messages(s) == []


def test_opposite_conditions_in_a_rule():
    s = strategy(rule("buy", rsi("above", 70), rsi("below", 30)))
    assert messages(s) == ["La regla de compra 1 tiene condiciones opuestas sobre RSI (14)."]


def test_event_directions_in_a_rule():
    up = {"kind": "ma-cross", "ma": "sma", "fast": 20, "slow": 50, "direction": "up"}
    s = strategy(rule("buy", up, {**up, "direction": "down"}))
    assert len(messages(s)) == 1


def test_band_inside_a_rule_is_fine():
    s = strategy(rule("buy", rsi("above", 30), rsi("below", 50)))
    assert messages(s) == []


def test_overlapping_buy_and_sell():
    s = strategy(rule("buy", rsi("below", 40)), rule("sell", rsi("above", 30)))
    assert len(messages(s)) == 1


def test_disjoint_shared_subject_is_fine():
    vol = {"kind": "volume", "op": "above", "multiple": 2, "period": 20}
    s = strategy(rule("buy", rsi("below", 30), vol), rule("sell", rsi("above", 70), vol))
    assert messages(s) == []


def test_unrelated_subjects_are_independent():
    s = strategy(rule("buy", rsi("below", 30)), rule("sell", change("up", 10, "entry")))
    assert messages(s) == []


def test_duplicate_rules():
    s = strategy(rule("buy", rsi("below", 30)), rule("buy", rsi("below", 30), size=50))
    assert messages(s) == ["La regla de compra 2 repite la regla de compra 1."]


def test_same_periodic_on_both_sides():
    weekly = {"kind": "periodic", "every": "week"}
    assert len(messages(strategy(rule("buy", weekly), rule("sell", weekly)))) == 1
