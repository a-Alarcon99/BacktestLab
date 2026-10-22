"""Report figures of a backtest, computed at full resolution from a `Simulation`.

Everything here is derived from the engine's per-candle arrays and orders; nothing changes the
simulation. Undefined figures (no losing trade for a profit factor, a range too short to
annualize…) are `None`, never inf/NaN, since the response models reject non-finite floats.

Conventions:
- a round trip goes from flat to flat; only closed ones count for win rate, averages, streaks
  and the profit factor; an open one is valued at the last close with the exit fee;
- "buy and hold" buys everything at the first open (fee) and is valued like the strategy;
- drawdown is measured on the liquidation value at each close, against the previous peak
  (the initial capital included).
"""

from dataclasses import dataclass
from math import isfinite, sqrt

import numpy as np
import pandas as pd

from app.schemas.backtest import (
    BacktestMetrics,
    DrawdownPeriod,
    PeriodReturn,
    PeriodReturns,
    RoundTrip,
)
from app.services.candles import TIMEFRAME_SPAN
from app.strategies.engine import PERIODS_PER_YEAR, Simulation

# Period unit of the "return per period" chart: the first one (no finer than a candle) giving at
# most MAX_PERIODS bars.
MAX_PERIODS = 36
_UNITS = [
    ("day", "D", 1.0),
    ("week", "W", 7.0),
    ("month", "M", 30.4375),
    ("quarter", "Q", 91.3125),
    ("year", "Y", 365.25),
]
# Ranges shorter than this aren't annualized (a 2-week figure raised to a year means nothing).
MIN_DAYS_TO_ANNUALIZE = 30


@dataclass
class Report:
    round_trips: list[RoundTrip]
    periods: PeriodReturns
    metrics: BacktestMetrics
    # Per candle (full resolution), % below the previous peak.
    drawdown: np.ndarray
    benchmark_drawdown: np.ndarray


def _finite(value: float | None) -> float | None:
    return float(value) if value is not None and isfinite(value) else None


def drawdown_series(values: np.ndarray) -> np.ndarray:
    """% below the running peak of `values` (positive numbers, 0 at a new high)."""
    peak = np.maximum.accumulate(values)
    return (peak - values) / peak * 100


def longest_drawdown(
    values: np.ndarray, times: pd.DatetimeIndex, span_seconds: float, bucket: np.ndarray
) -> DrawdownPeriod | None:
    """Longest stretch below a previous peak. `values[0]` is the initial capital (before the
    first candle), `values[j]` the equity at the close of candle j-1."""
    n = len(times)
    best: tuple[int, int, bool] | None = None
    peak_j, peak = 0, values[0]
    for j in range(1, len(values)):
        if values[j] >= peak:
            if j - 1 > peak_j and (best is None or j - peak_j > best[1] - best[0]):
                best = (peak_j, j, True)
            peak_j, peak = j, values[j]
    end = len(values) - 1
    if end > peak_j and values[end] < peak and (best is None or end - peak_j > best[1] - best[0]):
        best = (peak_j, end, False)
    if best is None:
        return None
    start_j, end_j, recovered = best

    def close_time(j: int) -> pd.Timestamp:
        # Close of candle j-1 = open of candle j (the last one closes one span later).
        return times[j] if j < n else times[-1] + pd.Timedelta(seconds=span_seconds)

    start_time, end_time = close_time(start_j), close_time(end_j)
    return DrawdownPeriod(
        start_index=int(bucket[max(start_j - 1, 0)]),
        end_index=int(bucket[max(end_j - 1, 0)]),
        start_time=start_time.to_pydatetime(),
        end_time=end_time.to_pydatetime(),
        candles=end_j - start_j,
        seconds=(end_time - start_time).total_seconds(),
        recovered=recovered,
        depth_pct=float(drawdown_series(values)[start_j : end_j + 1].max()),
    )


def round_trips(
    sim: Simulation, bucket: np.ndarray, times: np.ndarray | None = None
) -> list[RoundTrip]:
    """`times`: `sim.times` as datetimes, when the caller already has them."""
    if times is None:
        times = sim.times.to_pydatetime()
    n = len(times)
    span = TIMEFRAME_SPAN[sim.timeframe]
    lows, closes = sim.ohlc[:, 2], sim.ohlc[:, 3]
    groups: dict[int, list[dict]] = {}
    for t in sim.trades:
        groups.setdefault(t["round_trip"], []).append(t)

    last_trip = max(groups, default=-1)
    trips = []
    for trip_id, orders in groups.items():
        buys = [t for t in orders if t["side"] == "buy"]
        sells = [t for t in orders if t["side"] == "sell"]
        bought = sum(t["quantity"] for t in buys)
        sold = sum(t["quantity"] for t in sells)
        invested = sum(t["amount"] for t in buys)
        proceeds = sum(t["amount"] for t in sells)
        entry_i = buys[0]["i"]
        is_open = trip_id == last_trip and sim.stats.open_position
        entry_price = sum(t["quantity"] * t["price"] for t in buys) / bought
        if is_open:
            exit_i = n - 1
            exit_price = float(closes[-1])
            pnl = proceeds + (bought - sold) * closes[-1] * (1 - sim.fee) - invested
            held = lows[entry_i:]
            exit_time = None
            duration = (times[-1] + span - times[entry_i]).total_seconds()
        else:
            exit_i = sells[-1]["i"]
            exit_price = sum(t["quantity"] * t["price"] for t in sells) / sold
            pnl = proceeds - invested
            # The exit fills at the open of its candle: the candles held are [entry, exit).
            held = lows[entry_i:exit_i]
            exit_time = times[exit_i]
            duration = (times[exit_i] - times[entry_i]).total_seconds()
        worst = min(float(held.min()) / entry_price - 1, 0.0) * 100 if len(held) else 0.0
        trips.append(
            RoundTrip(
                entry_index=int(bucket[entry_i]),
                exit_index=int(bucket[exit_i]),
                entry_time=times[entry_i],
                exit_time=exit_time,
                entry_price=entry_price,
                exit_price=exit_price,
                invested=invested,
                pnl=pnl,
                pnl_pct=pnl / invested * 100,
                bars=exit_i - entry_i,
                duration_seconds=duration,
                exit_rule_id=None if is_open else sells[-1]["rule_id"],
                open=bool(is_open),
                worst_pct=worst,
                buys=len(buys),
                sells=len(sells),
            )
        )
    return trips


def period_returns(sim: Simulation, days: float) -> PeriodReturns:
    span_days = TIMEFRAME_SPAN[sim.timeframe].total_seconds() / 86_400
    unit, freq = _UNITS[-1][:2]
    for name, alias, unit_days in _UNITS:
        if unit_days >= span_days * 0.9 and days / unit_days <= MAX_PERIODS:
            unit, freq = name, alias
            break
    keys = sim.times.tz_localize(None).to_period(freq)
    frame = pd.DataFrame({"equity": sim.equity, "benchmark": sim.benchmark}, index=keys)
    ends = frame.groupby(level=0, sort=True).last()
    before = ends.shift(1).fillna(sim.capital)
    change = (ends / before - 1) * 100
    items = [
        PeriodReturn(
            start=period.start_time.date(),
            return_pct=float(row.equity),
            benchmark_pct=float(row.benchmark),
        )
        for period, row in change.iterrows()
    ]
    return PeriodReturns(unit=unit, items=items)


def _streaks(wins: list[bool]) -> tuple[int, int]:
    best_win = best_loss = run = 0
    last = None
    for w in wins:
        run = run + 1 if w == last else 1
        last = w
        if w:
            best_win = max(best_win, run)
        else:
            best_loss = max(best_loss, run)
    return best_win, best_loss


def analyze(sim: Simulation, bucket: np.ndarray, times: np.ndarray) -> Report:
    """`times`: `sim.times` as datetimes."""
    span_seconds = TIMEFRAME_SPAN[sim.timeframe].total_seconds()
    capital = sim.capital
    values = np.concatenate([[capital], sim.equity])
    bench_values = np.concatenate([[capital], sim.benchmark])
    dd = drawdown_series(values)
    bench_dd = drawdown_series(bench_values)
    days = ((sim.times[-1] - sim.times[0]).total_seconds() + span_seconds) / 86_400

    trips = round_trips(sim, bucket, times)
    closed = [t for t in trips if not t.open]
    pnls = np.array([t.pnl for t in closed])
    pcts = np.array([t.pnl_pct for t in closed])
    won = pnls > 0
    gross_win = float(pnls[won].sum()) if len(pnls) else 0.0
    gross_loss = float(-pnls[~won].sum()) if len(pnls) else 0.0
    avg_win = float(pcts[won].mean()) if won.any() else None
    avg_loss = float(pcts[~won].mean()) if (~won).any() else None
    best_win, best_loss = _streaks(won.tolist())

    final = float(sim.equity[-1])
    returns = np.diff(values) / values[:-1]
    ppy = PERIODS_PER_YEAR[sim.timeframe]
    std = float(returns.std(ddof=1)) if len(returns) > 1 else 0.0
    downside = float(np.sqrt(np.mean(np.minimum(returns, 0) ** 2)))
    max_dd = float(dd.max())
    cagr = None
    if days >= MIN_DAYS_TO_ANNUALIZE:
        cagr = ((final / capital) ** (365.25 / days) - 1) * 100 if final > 0 else -100.0
    cagr = _finite(cagr)

    metrics = BacktestMetrics(
        days=days,
        net_profit=final - capital,
        return_pct=sim.stats.return_pct,
        benchmark_return_pct=sim.stats.benchmark_return_pct,
        excess_return_pct=sim.stats.return_pct - sim.stats.benchmark_return_pct,
        max_drawdown_pct=max_dd,
        benchmark_max_drawdown_pct=float(bench_dd.max()),
        max_drawdown_index=int(bucket[int(dd[1:].argmax())]) if max_dd > 0 else None,
        longest_drawdown=longest_drawdown(values, sim.times, span_seconds, bucket),
        round_trips=len(closed),
        wins=int(won.sum()),
        losses=int((~won).sum()),
        win_rate_pct=sim.stats.win_rate_pct,
        profit_factor=_finite(gross_win / gross_loss) if gross_loss > 0 else None,
        avg_win_pct=avg_win,
        avg_loss_pct=avg_loss,
        payoff_ratio=_finite(avg_win / -avg_loss) if avg_win is not None and avg_loss else None,
        expectancy_pct=float(pcts.mean()) if len(pcts) else None,
        expectancy_usdt=float(pnls.mean()) if len(pnls) else None,
        best_trade_pct=float(pcts.max()) if len(pcts) else None,
        worst_trade_pct=float(pcts.min()) if len(pcts) else None,
        best_trade_share_pct=float(pnls.max() / gross_win * 100) if gross_win > 0 else None,
        max_win_streak=best_win,
        max_loss_streak=best_loss,
        avg_bars=float(np.mean([t.bars for t in closed])) if closed else None,
        avg_duration_seconds=float(np.mean([t.duration_seconds for t in closed]))
        if closed
        else None,
        exposure_pct=float(sim.in_market.mean() * 100),
        fees_paid=sim.fees_paid,
        trades_per_month=len(trips) / (days / 30.4375),
        cagr_pct=cagr,
        sharpe=_finite(float(returns.mean()) / std * sqrt(ppy)) if std > 0 else None,
        sortino=_finite(float(returns.mean()) / downside * sqrt(ppy)) if downside > 0 else None,
        calmar=_finite(cagr / max_dd) if cagr is not None and max_dd > 0 else None,
        volatility_pct=_finite(std * sqrt(ppy) * 100) if std > 0 else None,
    )
    return Report(
        round_trips=trips,
        periods=period_returns(sim, days),
        metrics=metrics,
        drawdown=dd[1:],
        benchmark_drawdown=bench_dd[1:],
    )
