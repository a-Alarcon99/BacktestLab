"""Backtest engine: spot, long only, fractional quantities, fee charged on every order.

Signals are computed vectorized (one boolean column per condition, ANDed per rule); a single
loop over numpy arrays then simulates the orders, since sizes and "price since the entry"
depend on the position. Orders fill at the close of the candle that triggers them. At most one
order per candle: sell rules are checked first (risk off), and within a side the first rule
whose conditions hold wins.
"""

from dataclasses import dataclass, field
from datetime import datetime
from math import sqrt

import numpy as np
import pandas as pd

from app.schemas.backtest import (
    BacktestResult,
    BacktestStats,
    PriceChangeCondition,
    ReplayCandle,
    Rule,
    StrategyConfig,
    Trade,
)
from app.services.candles import InvalidRangeError, Timeframe
from app.strategies.conditions import entry_change_matches, spec

PERIODS_PER_YEAR: dict[Timeframe, int] = {
    "1h": 24 * 365,
    "4h": 6 * 365,
    "1d": 365,
    "1w": 52,
    "1M": 12,
}
# Candles sent for the replay animation; longer runs are merged into buckets.
MAX_DISPLAY_CANDLES = 1500
EQUITY_CURVE_POINTS = 24
MIN_ORDER_USDT = 0.01


def warmup_candles(strategy: StrategyConfig) -> int:
    """Candles needed before the range so every indicator is valid on its first candle."""
    return max(spec(c).warmup(c) for rule in strategy.rules for c in rule.conditions)


@dataclass
class _CompiledRule:
    rule: Rule
    mask: np.ndarray
    # Conditions on the price change since the entry, checked inside the loop.
    entry: list[PriceChangeCondition] = field(default_factory=list)

    def fires(self, i: int, entry_change: float | None) -> bool:
        if not self.mask[i]:
            return False
        if not self.entry:
            return True
        return entry_change is not None and all(
            entry_change_matches(c, entry_change) for c in self.entry
        )


def _compile(df: pd.DataFrame, rule: Rule) -> _CompiledRule:
    compiled = _CompiledRule(rule, np.ones(len(df), dtype=bool))
    for condition in rule.conditions:
        signal = spec(condition).evaluate(df, condition)
        if signal is None:
            compiled.entry.append(condition)
        else:
            compiled.mask &= signal.to_numpy(dtype=bool, na_value=False)
    return compiled


@dataclass
class Simulation:
    """Per-candle arrays over the backtest range (warm-up candles excluded)."""

    times: pd.DatetimeIndex
    ohlc: np.ndarray  # shape (n, 4)
    buys: np.ndarray
    sells: np.ndarray
    realized: np.ndarray
    equity: np.ndarray
    trades: list[dict]
    stats: BacktestStats


def simulate(
    df: pd.DataFrame, strategy: StrategyConfig, start: datetime, timeframe: Timeframe
) -> Simulation:
    """Run `strategy` over the candles of `df` from `start` on (earlier candles only warm up)."""
    first = int(df.index.searchsorted(pd.Timestamp(start)))
    n = len(df) - first
    if n < 2:
        raise InvalidRangeError("Not enough candles in the range")

    compiled = [_compile(df, rule) for rule in strategy.rules]
    buy_rules = [r for r in compiled if r.rule.side == "buy"]
    sell_rules = [r for r in compiled if r.rule.side == "sell"]
    close = df.close.to_numpy(dtype=float)
    times = df.index[first:]
    fee = strategy.fee_pct / 100
    capital = strategy.initial_capital

    cash, qty, cost = capital, 0.0, 0.0  # cost: USDT paid for the open position, fees included
    n_buys = n_sells = wins = 0
    realized_pnl = 0.0
    trades: list[dict] = []
    buys = np.zeros(n, dtype=int)
    sells = np.zeros(n, dtype=int)
    realized = np.zeros(n)
    equity = np.zeros(n)

    for k in range(n):
        i = first + k
        price = close[i]
        entry_change = (price / (cost / qty) - 1) * 100 if qty > 0 else None

        sold = False
        if qty > 0:
            for r in sell_rules:
                if not r.fires(i, entry_change):
                    continue
                share = r.rule.size.value / 100
                q = qty * share
                proceeds = q * price * (1 - fee)
                basis = cost * share
                pnl = proceeds - basis
                cash += proceeds
                qty, cost = (0.0, 0.0) if share >= 1 else (qty - q, cost - basis)
                realized_pnl += pnl
                n_sells += 1
                wins += pnl > 0
                trades.append(
                    {
                        "i": k,
                        "side": "sell",
                        "price": price,
                        "quantity": q,
                        "amount": proceeds,
                        "pnl": pnl,
                    }
                )
                sold = True
                break

        if not sold:
            for r in buy_rules:
                if not r.fires(i, entry_change):
                    continue
                size = r.rule.size
                amount = cash * size.value / 100 if size.unit == "pct" else min(size.value, cash)
                if amount >= MIN_ORDER_USDT:
                    q = amount * (1 - fee) / price
                    cash -= amount
                    qty += q
                    cost += amount
                    n_buys += 1
                    trades.append(
                        {
                            "i": k,
                            "side": "buy",
                            "price": price,
                            "quantity": q,
                            "amount": amount,
                            "pnl": None,
                        }
                    )
                break

        buys[k] = n_buys
        sells[k] = n_sells
        realized[k] = realized_pnl
        equity[k] = cash + qty * price

    values = np.concatenate([[capital], equity])
    peak = np.maximum.accumulate(values)
    returns = np.diff(values) / values[:-1]
    std = returns.std(ddof=1)
    final = float(equity[-1])
    stats = BacktestStats(
        buys=n_buys,
        sells=n_sells,
        trades=n_buys + n_sells,
        realized_pnl=realized_pnl,
        unrealized_pnl=qty * close[-1] - cost,
        return_pct=(final - capital) / capital * 100,
        win_rate_pct=wins / n_sells * 100 if n_sells else 0.0,
        max_drawdown_pct=float(((peak - values) / peak).max() * 100),
        sharpe=float(returns.mean() / std * sqrt(PERIODS_PER_YEAR[timeframe])) if std > 0 else 0.0,
        final_capital=final,
        open_position=qty > 0,
    )
    ohlc = df[["open", "high", "low", "close"]].to_numpy(dtype=float)[first:]
    return Simulation(times, ohlc, buys, sells, realized, equity, trades, stats)


def to_result(sim: Simulation, initial_capital: float) -> BacktestResult:
    """Downsample a simulation to at most MAX_DISPLAY_CANDLES for the replay animation."""
    n = len(sim.times)
    size = min(n, MAX_DISPLAY_CANDLES)
    bucket = np.arange(n) * size // n  # contiguous, non-decreasing bucket per candle
    first = np.searchsorted(bucket, np.arange(size), side="left")
    last = np.searchsorted(bucket, np.arange(size), side="right") - 1
    high = np.maximum.reduceat(sim.ohlc[:, 1], first)
    low = np.minimum.reduceat(sim.ohlc[:, 2], first)

    candles = [
        ReplayCandle(
            time=sim.times[f].to_pydatetime(),
            open=sim.ohlc[f, 0],
            high=h,
            low=lo,
            close=sim.ohlc[la, 3],
        )
        for f, la, h, lo in zip(first, last, high, low, strict=True)
    ]
    trades = [
        Trade(
            time=sim.times[t["i"]].to_pydatetime(),
            index=int(bucket[t["i"]]),
            side=t["side"],
            price=t["price"],
            quantity=t["quantity"],
            amount=t["amount"],
            pnl=t["pnl"],
        )
        for t in sim.trades
    ]
    values = np.concatenate([[initial_capital], sim.equity])
    curve_index = np.linspace(0, n, min(EQUITY_CURVE_POINTS, n + 1)).round().astype(int)
    return BacktestResult(
        candle_count=n,
        candles=candles,
        trades=trades,
        buys=sim.buys[last].tolist(),
        sells=sim.sells[last].tolist(),
        realized=sim.realized[last].tolist(),
        equity=sim.equity[last].tolist(),
        equity_curve=(values[curve_index] / initial_capital * 100).tolist(),
        stats=sim.stats,
    )
