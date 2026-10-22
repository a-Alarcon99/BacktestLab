"""Backtest engine: spot, long only, fractional quantities, fee charged on every order.

Signals are computed vectorized (one boolean column per condition, ANDed per rule); a single
loop over numpy arrays then simulates the orders, since sizes and "price since the entry"
depend on the position. A signal is known at the close of its candle, so its order fills at the
open of the next candle (a signal on the last candle never fills). At most one order per candle:
sell rules are checked first (risk off), and within a side the first rule whose conditions hold
(and, for a buy, whose amount reaches MIN_ORDER_USDT) wins.

Equity is the liquidation value: cash plus the position sold at the close with its fee, i.e.
what the account would hold if it sold right then. A partial sell that would leave less than
DUST_PCT of the initial capital sells everything, so positions always end up closed.
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
    "1m": 1440 * 365,
    "3m": 480 * 365,
    "5m": 288 * 365,
    "15m": 96 * 365,
    "30m": 48 * 365,
    "1h": 24 * 365,
    "2h": 12 * 365,
    "4h": 6 * 365,
    "1d": 365,
    "1w": 52,
    "1M": 12,
}
# Candles sent for the replay animation; longer runs are merged into buckets.
MAX_DISPLAY_CANDLES = 1500
EQUITY_CURVE_POINTS = 24
MIN_ORDER_USDT = 0.01
# A partial sell leaving a position worth less than this % of the initial capital sells it all.
DUST_PCT = 1.0


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
    # Liquidation value at each close, for the strategy and for buying at the first open.
    equity: np.ndarray
    benchmark: np.ndarray
    # True where a position is held at the close.
    in_market: np.ndarray
    # Orders: i (fill candle), signal_i, side, price, quantity, amount, pnl, rule_id, round_trip.
    trades: list[dict]
    stats: BacktestStats
    timeframe: Timeframe
    capital: float
    fee: float
    fees_paid: float


@dataclass
class _Pending:
    side: str
    rule: Rule
    signal_i: int


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
    opens = df.open.to_numpy(dtype=float)
    close = df.close.to_numpy(dtype=float)
    times = df.index[first:]
    fee = strategy.fee_pct / 100
    capital = strategy.initial_capital
    dust = capital * DUST_PCT / 100

    # cost: USDT paid for the open position, fees included; entry_px: average fill price.
    cash, qty, cost, entry_px = capital, 0.0, 0.0, 0.0
    n_buys = n_sells = 0
    trip = -1  # index of the current (or last) round trip
    trip_pnl = 0.0
    closed_trips = wins = 0
    realized_pnl = fees_paid = 0.0
    trades: list[dict] = []
    pending: _Pending | None = None
    buys = np.zeros(n, dtype=int)
    sells = np.zeros(n, dtype=int)
    realized = np.zeros(n)
    equity = np.zeros(n)
    in_market = np.zeros(n, dtype=bool)

    def buy_amount(rule: Rule) -> float:
        size = rule.size
        return cash * size.value / 100 if size.unit == "pct" else min(size.value, cash)

    for k in range(n):
        i = first + k

        # 1. The order signalled at the previous close fills at this open.
        if pending is not None:
            price = opens[i]
            if pending.side == "sell":
                share = pending.rule.size.value / 100
                q = qty * share
                if share < 1 and (qty - q) * price * (1 - fee) < dust:
                    share, q = 1.0, qty
                proceeds = q * price * (1 - fee)
                basis = cost * share
                pnl = proceeds - basis
                fees_paid += q * price * fee
                cash += proceeds
                if share >= 1:
                    qty, cost = 0.0, 0.0
                else:
                    qty, cost = qty - q, cost - basis
                realized_pnl += pnl
                trip_pnl += pnl
                n_sells += 1
                trades.append(
                    {
                        "i": k,
                        "signal_i": pending.signal_i,
                        "side": "sell",
                        "price": price,
                        "quantity": q,
                        "amount": proceeds,
                        "pnl": pnl,
                        "rule_id": pending.rule.id,
                        "round_trip": trip,
                    }
                )
                if qty == 0:
                    closed_trips += 1
                    wins += trip_pnl > 0
            else:
                amount = buy_amount(pending.rule)
                q = amount * (1 - fee) / price
                if qty == 0:
                    trip += 1
                    trip_pnl = 0.0
                entry_px = (entry_px * qty + q * price) / (qty + q)
                fees_paid += amount * fee
                cash -= amount
                qty += q
                cost += amount
                n_buys += 1
                trades.append(
                    {
                        "i": k,
                        "signal_i": pending.signal_i,
                        "side": "buy",
                        "price": price,
                        "quantity": q,
                        "amount": amount,
                        "pnl": None,
                        "rule_id": pending.rule.id,
                        "round_trip": trip,
                    }
                )
            pending = None

        # 2. Signals at this close, for an order at the next open (none on the last candle).
        if k < n - 1:
            entry_change = (close[i] / entry_px - 1) * 100 if qty > 0 else None
            if qty > 0:
                for r in sell_rules:
                    if r.fires(i, entry_change):
                        pending = _Pending("sell", r.rule, k)
                        break
            if pending is None:
                for r in buy_rules:
                    if r.fires(i, entry_change) and buy_amount(r.rule) >= MIN_ORDER_USDT:
                        pending = _Pending("buy", r.rule, k)
                        break

        buys[k] = n_buys
        sells[k] = n_sells
        realized[k] = realized_pnl
        equity[k] = cash + qty * close[i] * (1 - fee)
        in_market[k] = qty > 0

    closes = close[first:]
    benchmark = capital * (1 - fee) / opens[first] * closes * (1 - fee)
    values = np.concatenate([[capital], equity])
    peak = np.maximum.accumulate(values)
    returns = np.diff(values) / values[:-1]
    std = returns.std(ddof=1)
    final = float(equity[-1])
    stats = BacktestStats(
        buys=n_buys,
        sells=n_sells,
        trades=n_buys + n_sells,
        round_trips=closed_trips,
        realized_pnl=realized_pnl,
        unrealized_pnl=qty * closes[-1] * (1 - fee) - cost,
        return_pct=(final - capital) / capital * 100,
        benchmark_return_pct=float(benchmark[-1] / capital - 1) * 100,
        win_rate_pct=wins / closed_trips * 100 if closed_trips else 0.0,
        max_drawdown_pct=float(((peak - values) / peak).max() * 100),
        sharpe=float(returns.mean() / std * sqrt(PERIODS_PER_YEAR[timeframe])) if std > 0 else 0.0,
        final_capital=final,
        open_position=qty > 0,
    )
    ohlc = df[["open", "high", "low", "close"]].to_numpy(dtype=float)[first:]
    return Simulation(
        times=times,
        ohlc=ohlc,
        buys=buys,
        sells=sells,
        realized=realized,
        equity=equity,
        benchmark=benchmark,
        in_market=in_market,
        trades=trades,
        stats=stats,
        timeframe=timeframe,
        capital=capital,
        fee=fee,
        fees_paid=fees_paid,
    )


def to_result(sim: Simulation) -> BacktestResult:
    """Downsample a simulation to at most MAX_DISPLAY_CANDLES for the replay and the report.

    Figures and series of the report are computed at full resolution first (`analytics`); the
    drawdown of a display candle is the deepest one inside it, so merging never hides a fall.
    """
    from app.strategies import analytics  # imports this module

    n = len(sim.times)
    size = min(n, MAX_DISPLAY_CANDLES)
    bucket = np.arange(n) * size // n  # contiguous, non-decreasing bucket per candle
    first = np.searchsorted(bucket, np.arange(size), side="left")
    last = np.searchsorted(bucket, np.arange(size), side="right") - 1
    high = np.maximum.reduceat(sim.ohlc[:, 1], first)
    low = np.minimum.reduceat(sim.ohlc[:, 2], first)

    times = sim.times.to_pydatetime()  # indexing a DatetimeIndex per item is slow
    candles = [
        ReplayCandle(
            time=times[f],
            open=sim.ohlc[f, 0],
            high=h,
            low=lo,
            close=sim.ohlc[la, 3],
        )
        for f, la, h, lo in zip(first, last, high, low, strict=True)
    ]
    trades = [
        Trade(
            time=times[t["i"]],
            signal_time=times[t["signal_i"]],
            index=int(bucket[t["i"]]),
            side=t["side"],
            price=t["price"],
            quantity=t["quantity"],
            amount=t["amount"],
            pnl=t["pnl"],
            rule_id=t["rule_id"],
            round_trip=t["round_trip"],
        )
        for t in sim.trades
    ]
    report = analytics.analyze(sim, bucket, times)
    values = np.concatenate([[sim.capital], sim.equity])
    curve_index = np.linspace(0, n, min(EQUITY_CURVE_POINTS, n + 1)).round().astype(int)
    return BacktestResult(
        candle_count=n,
        candles=candles,
        trades=trades,
        buys=sim.buys[last].tolist(),
        sells=sim.sells[last].tolist(),
        realized=sim.realized[last].tolist(),
        equity=sim.equity[last].tolist(),
        benchmark=sim.benchmark[last].tolist(),
        drawdown=np.maximum.reduceat(report.drawdown, first).tolist(),
        benchmark_drawdown=np.maximum.reduceat(report.benchmark_drawdown, first).tolist(),
        equity_curve=(values[curve_index] / sim.capital * 100).tolist(),
        round_trips=report.round_trips,
        periods=report.periods,
        metrics=report.metrics,
        stats=sim.stats,
    )
