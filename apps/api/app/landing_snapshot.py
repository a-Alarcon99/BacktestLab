"""Real backtest results for the landing page animations.

Runs the built-in strategies (mirrored from `apps/web/src/lib/preset-strategies.ts`) through the
engine on BTC and writes `apps/web/src/lib/landing/snapshot.json`. The landing stays prerendered
and never calls the API; re-run this by hand to refresh the figures:

    .venv\\Scripts\\python -m app.landing_snapshot [--end YYYY-MM-DD]
"""

import argparse
import json
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from app.core import db
from app.schemas.backtest import StrategyConfig
from app.services.candles import TIMEFRAME_SPAN, Timeframe, get_asset_ref, get_candles
from app.strategies import analytics
from app.strategies import indicators as ind
from app.strategies.conditions import spec
from app.strategies.engine import Simulation, simulate, warmup_candles

SYMBOL = "BTC"
FEE_PCT = 0.1
CAPITAL = 10_000
OUT = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "landing" / "snapshot.json"

ALL = {"unit": "pct", "value": 100}


def _rule(id_: str, side: str, conditions: list[dict]) -> dict:
    return {"id": id_, "side": side, "conditions": conditions, "size": ALL}


RSI_LOW = {"kind": "rsi", "period": 14, "op": "below", "value": 30}
BAND_LOW = {"kind": "bollinger", "period": 20, "stdDev": 2, "band": "lower"}

PRESETS: dict[str, dict] = {
    "preset-short": {
        "timeframe": "4h",
        "days": 182,
        "rules": [
            _rule("short-buy", "buy", [RSI_LOW, BAND_LOW]),
            _rule(
                "short-sell-rsi",
                "sell",
                [{"kind": "rsi", "period": 14, "op": "above", "value": 55}],
            ),
            _rule(
                "short-sell-band",
                "sell",
                [{"kind": "bollinger", "period": 20, "stdDev": 2, "band": "upper"}],
            ),
            _rule(
                "short-sell-stop",
                "sell",
                [{"kind": "price-change", "direction": "down", "pct": 4, "lookback": "entry"}],
            ),
        ],
    },
    "preset-medium": {
        "timeframe": "1d",
        "days": 365,
        "rules": [
            _rule(
                "medium-buy",
                "buy",
                [
                    {"kind": "ma-cross", "ma": "ema", "fast": 20, "slow": 50, "direction": "up"},
                    {"kind": "rsi", "period": 14, "op": "above", "value": 50},
                ],
            ),
            _rule(
                "medium-sell-cross",
                "sell",
                [{"kind": "ma-cross", "ma": "ema", "fast": 20, "slow": 50, "direction": "down"}],
            ),
            _rule(
                "medium-sell-stop",
                "sell",
                [{"kind": "price-change", "direction": "down", "pct": 10, "lookback": "entry"}],
            ),
        ],
    },
    "preset-long": {
        "timeframe": "1d",
        "days": 3 * 365,
        "rules": [
            _rule("long-buy", "buy", [{"kind": "donchian", "period": 100, "direction": "up"}]),
            _rule(
                "long-sell-channel",
                "sell",
                [{"kind": "donchian", "period": 50, "direction": "down"}],
            ),
            _rule(
                "long-sell-stop",
                "sell",
                [{"kind": "price-change", "direction": "down", "pct": 25, "lookback": "entry"}],
            ),
        ],
    },
}

REPLAY_WINDOW = 180  # 4h candles shown by the hero replay (30 days)
REPLAY_SEARCH_DAYS = 2 * 365
REPLAY_MIN_TRADES = 3
BUILDER_DAYS = 365  # "signals in 1 year"
BUILDER_POINTS = 90
METRICS_TIMEFRAME: Timeframe = "4h"
METRICS_DAYS = 2 * 365
METRICS_POINTS = 260


def _strategy(rules: list[dict]) -> StrategyConfig:
    return StrategyConfig.model_validate(
        {"initialCapital": CAPITAL, "feePct": FEE_PCT, "rules": rules}
    )


def _midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, UTC)


def _load(
    conn, asset, timeframe: Timeframe, strategy: StrategyConfig, start: datetime, end: datetime
) -> pd.DataFrame:
    """Candles of [start, end) plus the warm-up the strategy needs before `start`."""
    warmup = (warmup_candles(strategy) + 5) * TIMEFRAME_SPAN[timeframe]
    df = get_candles(conn, asset, timeframe, start - warmup, end)
    return df[df.index < end]


def _round_trips(sim: Simulation) -> list[dict]:
    """Closed round trips (flat to flat), as candle indices of the range."""
    trips = analytics.round_trips(sim, np.arange(len(sim.times)))
    return [
        {
            "entry": t.entry_index,
            "exit": t.exit_index,
            "entryPrice": round(t.entry_price, 2),
            "exitPrice": round(t.exit_price, 2),
            "pnlPct": round(t.pnl_pct, 2),
            "bars": t.bars,
            "exitRule": t.exit_rule_id,
        }
        for t in trips
        if not t.open
    ]


def _stats(sim: Simulation) -> dict:
    s = sim.stats
    return {
        "returnPct": round(s.return_pct, 2),
        "winRatePct": round(s.win_rate_pct, 1),
        "maxDrawdownPct": round(s.max_drawdown_pct, 2),
        "sharpe": round(s.sharpe, 2),
        "roundTrips": s.round_trips,
        "openPosition": s.open_position,
    }


def _curve(sim: Simulation, points: int) -> list[float]:
    values = np.concatenate([[CAPITAL], sim.equity])
    idx = np.linspace(0, len(values) - 1, points).round().astype(int)
    return [round(float(v) / CAPITAL * 100, 2) for v in values[idx]]


def _bucket(n: int, points: int) -> np.ndarray:
    """Display point of each of `n` candles when shown as `points` evenly spaced points."""
    return np.arange(n) * points // n


def presets(conn, asset, end: datetime) -> dict:
    out = {}
    for preset_id, cfg in PRESETS.items():
        strategy = _strategy(cfg["rules"])
        start = end - timedelta(days=cfg["days"])
        df = _load(conn, asset, cfg["timeframe"], strategy, start, end)
        sim = simulate(df, strategy, start, cfg["timeframe"])
        out[preset_id] = {
            "timeframe": cfg["timeframe"],
            "from": sim.times[0].date().isoformat(),
            "to": sim.times[-1].date().isoformat(),
            **_stats(sim),
            "buyHoldPct": round(sim.stats.benchmark_return_pct, 2),
            "curve": _curve(sim, 40),
        }
    return out


def replay(conn, asset, end: datetime) -> dict:
    """An example month of the short-term preset for the hero, picked by a fixed rule.

    The most recent window that starts and ends flat, has REPLAY_MIN_TRADES+ closed trades, at
    least one of them losing, and ends in profit. The landing labels it with its exact dates.
    """
    cfg = PRESETS["preset-short"]
    strategy = _strategy(cfg["rules"])
    start = end - timedelta(days=REPLAY_SEARCH_DAYS)
    df = _load(conn, asset, "4h", strategy, start, end)
    full = simulate(df, strategy, start, "4h")
    trips = _round_trips(full)
    n = len(full.times)
    chosen = None
    for w_end in range(n, REPLAY_WINDOW + 1, -2):
        w_start = w_end - REPLAY_WINDOW
        lead = w_start + 25  # candles before the first entry, so the bands are drawn first
        inside = [t for t in trips if t["entry"] >= lead and t["exit"] < w_end - 4]
        crossing = [
            t
            for t in trips
            if (t["entry"] < lead and t["exit"] >= w_start) or t["entry"] < w_end <= t["exit"]
        ]
        before = full.equity[w_start - 1] if w_start > 0 else CAPITAL
        profit = full.equity[w_end - 1] > before
        if (
            len(inside) >= REPLAY_MIN_TRADES
            and not crossing
            and profit
            and any(t["pnlPct"] < 0 for t in inside)
        ):
            chosen = w_start
            break
    if chosen is None:
        raise SystemExit("No replay window matches; widen REPLAY_SEARCH_DAYS")

    w_start_time = full.times[chosen].to_pydatetime()
    sim = simulate(df, strategy, w_start_time, "4h")
    k0 = int(df.index.searchsorted(pd.Timestamp(w_start_time)))
    window = df.iloc[k0 : k0 + REPLAY_WINDOW]
    lower, upper = ind.bollinger(df.close, 20, 2)
    rsi = ind.rsi(df.close, 14)
    trips = [t for t in _round_trips(sim) if t["exit"] < REPLAY_WINDOW]
    for t in trips:
        t["entryRsi"] = round(float(rsi.iloc[k0 + t["entry"]]), 1)
    eq = sim.equity[:REPLAY_WINDOW]
    values = np.concatenate([[CAPITAL], eq])
    peak = np.maximum.accumulate(values)
    return {
        "timeframe": "4h",
        "start": window.index[0].isoformat().replace("+00:00", "Z"),
        "from": window.index[0].date().isoformat(),
        "to": window.index[-1].date().isoformat(),
        "candles": [
            [round(float(v), 2) for v in row]
            for row in window[["open", "high", "low", "close"]].to_numpy()
        ],
        "lower": [round(float(v), 2) for v in lower.iloc[k0 : k0 + REPLAY_WINDOW]],
        "upper": [round(float(v), 2) for v in upper.iloc[k0 : k0 + REPLAY_WINDOW]],
        "equity": [round(float(v), 2) for v in eq],
        "trades": trips,
        "stats": {
            "returnPct": round(float(eq[-1] / CAPITAL - 1) * 100, 2),
            "winRatePct": round(sum(t["pnlPct"] > 0 for t in trips) / len(trips) * 100, 1),
            "maxDrawdownPct": round(float(((peak - values) / peak).max() * 100), 2),
            "roundTrips": len(trips),
        },
    }


def builder(conn, asset, end: datetime) -> dict:
    """Candles where "RSI < 30" AND / OR "close below the lower band" hold over a year of 4h."""
    strategy = _strategy([_rule("b", "buy", [RSI_LOW, BAND_LOW])])
    start = end - timedelta(days=BUILDER_DAYS)
    df = _load(conn, asset, "4h", strategy, start, end)
    first = int(df.index.searchsorted(pd.Timestamp(start)))
    rule = strategy.rules[0]
    a, b = (
        spec(c).evaluate(df, c).to_numpy(dtype=bool, na_value=False)[first:]
        for c in rule.conditions
    )
    closes = df.close.to_numpy(dtype=float)[first:]
    n = len(closes)
    bucket = _bucket(n, BUILDER_POINTS)
    last = np.searchsorted(bucket, np.arange(BUILDER_POINTS), side="right") - 1
    return {
        "timeframe": "4h",
        "from": df.index[first].date().isoformat(),
        "to": df.index[-1].date().isoformat(),
        "closes": [round(float(closes[i]), 2) for i in last],
        "and": sorted({int(bucket[i]) for i in np.flatnonzero(a & b)}),
        "or": sorted({int(bucket[i]) for i in np.flatnonzero(a | b)}),
        "andCount": int((a & b).sum()),
        "orCount": int((a | b).sum()),
    }


def metrics(conn, asset, end: datetime) -> dict:
    """Two years of the medium-term preset, shown as METRICS_POINTS price points."""
    cfg = PRESETS["preset-medium"]
    strategy = _strategy(cfg["rules"])
    start = end - timedelta(days=METRICS_DAYS)
    df = _load(conn, asset, METRICS_TIMEFRAME, strategy, start, end)
    sim = simulate(df, strategy, start, METRICS_TIMEFRAME)
    n = len(sim.times)
    points = min(METRICS_POINTS, n)
    bucket = _bucket(n, points)
    last = np.searchsorted(bucket, np.arange(points), side="right") - 1
    trips = _round_trips(sim)
    values = np.concatenate([[CAPITAL], sim.equity])
    drawdown = np.maximum.accumulate(values) - values
    drawdown_pct = np.maximum.accumulate(drawdown / np.maximum.accumulate(values)) * 100
    for t in trips:
        # Exact (full resolution) running figures once this trade is closed.
        t["returnAfterPct"] = round(float(sim.equity[t["exit"]] / CAPITAL - 1) * 100, 2)
        t["maxDrawdownAfterPct"] = round(float(drawdown_pct[t["exit"] + 1]), 2)
        t["entry"], t["exit"] = int(bucket[t["entry"]]), int(bucket[t["exit"]])
    return {
        "timeframe": METRICS_TIMEFRAME,
        "from": sim.times[0].date().isoformat(),
        "to": sim.times[-1].date().isoformat(),
        "closes": [round(float(sim.ohlc[i, 3]), 2) for i in last],
        "equity": [round(float(sim.equity[i]), 2) for i in last],
        "trades": trips,
        "stats": _stats(sim),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.landing_snapshot", description=__doc__.split("\n")[0]
    )
    default_end = datetime.now(UTC).date().replace(day=1)  # last whole month
    parser.add_argument(
        "--end", type=date.fromisoformat, default=default_end, help="exclusive end day"
    )
    args = parser.parse_args(argv)
    end = _midnight(args.end)

    db.pool.open()
    try:
        with db.connection() as conn:
            asset = get_asset_ref(conn, SYMBOL)
            if asset is None:
                raise SystemExit(f"{SYMBOL} not found")
            data = {
                "symbol": SYMBOL,
                "feePct": FEE_PCT,
                "initialCapital": CAPITAL,
                "generatedAt": datetime.now(UTC).date().isoformat(),
                "replay": replay(conn, asset, end),
                "builder": builder(conn, asset, end),
                "metrics": metrics(conn, asset, end),
                "presets": presets(conn, asset, end),
            }
    finally:
        db.pool.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    for key in ("replay", "metrics"):
        print(key, data[key]["from"], data[key]["to"], data[key]["stats"])
    print("builder", data["builder"]["andCount"], data["builder"]["orCount"])
    for preset_id, p in data["presets"].items():
        print(preset_id, p["from"], p["to"], p["returnPct"], p["roundTrips"], p["buyHoldPct"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
