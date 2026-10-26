"""Monte Carlo over synthetic price paths (`kind: "mc-paths"`).

The real candles of the range are cut in short runs of consecutive candles (blocks) and glued
together at random into as many new price histories as asked; the strategy is then simulated on
each one exactly as on the real data. Blocks keep the local behaviour of the market (a candle
after a big one tends to be big too) and, because every candle is moved as a whole (its open, high,
low and close relative to the previous close), each synthetic candle stays coherent. The indicator
warm-up before the range is the real one.

Everything is deterministic: the same request and seed give the same paths and the same result.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from math import ceil, sqrt

import numpy as np
import pandas as pd

from app.schemas.backtest import McBands, McCheckpoint, McPathsResult, McReal, StrategyConfig
from app.services.candles import Timeframe
from app.strategies.engine import Simulation, simulate

# Points of every curve sent back (the equity of a path, resampled).
CURVE_POINTS = 160
# Paths drawn one by one in the animation.
SAMPLE_PATHS = 40
# Share of the paths seen at each step of the animation (the bands settle as more are added).
CHECKPOINT_SHARES = (0.02, 0.04, 0.07, 0.12, 0.2, 0.3, 0.45, 0.65, 0.85, 1.0)
BAND_PERCENTILES = (5, 25, 50, 75, 95)
# Fewer candles say nothing about how the market moves.
MIN_CANDLES = 30


def default_block_length(candles: int) -> int:
    """About the square root of the candles: long enough to keep the local behaviour."""
    return max(2, min(candles, round(sqrt(candles))))


def seed_of(parts: dict) -> int:
    """A stable 63-bit seed from the request (same request, same paths)."""
    digest = hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).digest()
    return int.from_bytes(digest[:8], "big") >> 1


@dataclass(frozen=True)
class Shapes:
    """The range's candles as ratios of the previous close, ready to be shuffled."""

    anchor: float
    ratios: np.ndarray  # (n, 4): open, high, low, close over the previous close
    volume: np.ndarray  # (n,)


def shapes_of(df: pd.DataFrame, first: int) -> Shapes:
    close = df.close.to_numpy(dtype=float)
    anchor = close[first - 1] if first > 0 else float(df.open.iloc[0])
    prev = np.concatenate([[anchor], close[first:-1]])
    body = df.iloc[first:]
    ratios = np.column_stack(
        [
            body.open.to_numpy(dtype=float) / prev,
            body.high.to_numpy(dtype=float) / prev,
            body.low.to_numpy(dtype=float) / prev,
            body.close.to_numpy(dtype=float) / prev,
        ]
    )
    return Shapes(anchor, ratios, body.volume.to_numpy(dtype=float))


def block_indices(rng: np.random.Generator, n: int, block: int) -> np.ndarray:
    """`n` candle positions made of random blocks of `block` consecutive ones (wrapping around)."""
    starts = rng.integers(0, n, size=ceil(n / block))
    return ((starts[:, None] + np.arange(block)) % n).ravel()[:n]


def synthetic_frame(
    df: pd.DataFrame, first: int, shapes: Shapes, picks: np.ndarray
) -> pd.DataFrame:
    """The warm-up of `df` followed by the candles `picks` of the range, glued one after another."""
    ratios = shapes.ratios[picks]
    closes = shapes.anchor * np.cumprod(ratios[:, 3])
    prev = np.concatenate([[shapes.anchor], closes[:-1]])
    ohlc = ratios * prev[:, None]
    body = pd.DataFrame(
        {
            "open": ohlc[:, 0],
            "high": ohlc[:, 1],
            "low": ohlc[:, 2],
            "close": ohlc[:, 3],
            "volume": shapes.volume[picks],
        },
        index=df.index[first:],
    )
    return pd.concat([df.iloc[:first], body]) if first > 0 else body


def _curve(sim: Simulation) -> np.ndarray:
    values = np.concatenate([[sim.capital], sim.equity]) / sim.capital * 100
    index = np.linspace(0, len(values) - 1, min(CURVE_POINTS, len(values))).round().astype(int)
    return values[index]


def _bands(curves: np.ndarray) -> McBands:
    p5, p25, p50, p75, p95 = np.round(np.percentile(curves, BAND_PERCENTILES, axis=0), 2).tolist()
    return McBands(p5=p5, p25=p25, p50=p50, p75=p75, p95=p95)


def checkpoints_of(paths: int) -> list[int]:
    return sorted({max(2, min(paths, round(paths * share))) for share in CHECKPOINT_SHARES})


def run_paths(
    df: pd.DataFrame,
    strategy: StrategyConfig,
    timeframe: Timeframe,
    start: datetime,
    paths: int,
    block_length: int | None,
    seed: int,
) -> McPathsResult:
    """The real run plus `paths` synthetic ones, aggregated (no individual path is kept but a few)."""
    first = int(df.index.searchsorted(pd.Timestamp(start)))
    n = len(df) - first
    real = simulate(df, strategy, start, timeframe)
    block = min(block_length or default_block_length(n), n)
    shapes = shapes_of(df, first)
    rng = np.random.default_rng(seed)

    curves = np.empty((paths, min(CURVE_POINTS, n + 1)))
    returns = np.empty(paths)
    drawdowns = np.empty(paths)
    beat_hold = 0
    for k in range(paths):
        sim = simulate(
            synthetic_frame(df, first, shapes, block_indices(rng, n, block)),
            strategy,
            start,
            timeframe,
        )
        curves[k] = _curve(sim)
        returns[k] = sim.stats.return_pct
        drawdowns[k] = sim.stats.max_drawdown_pct
        beat_hold += sim.stats.return_pct > sim.stats.benchmark_return_pct

    shown = np.linspace(0, paths - 1, min(SAMPLE_PATHS, paths)).round().astype(int)
    return McPathsResult(
        kind="mc-paths",
        runs=paths,
        block_length=block,
        seed=seed,
        candle_count=n,
        real=McReal(
            return_pct=real.stats.return_pct,
            benchmark_return_pct=real.stats.benchmark_return_pct,
            max_drawdown_pct=real.stats.max_drawdown_pct,
            curve=np.round(_curve(real), 2).tolist(),
        ),
        samples=np.round(curves[shown], 2).tolist(),
        bands=_bands(curves),
        checkpoints=[McCheckpoint(runs=k, bands=_bands(curves[:k])) for k in checkpoints_of(paths)],
        returns=np.round(returns, 2).tolist(),
        drawdowns=np.round(drawdowns, 2).tolist(),
        beat_hold_pct=float(beat_hold / paths * 100),
    )
