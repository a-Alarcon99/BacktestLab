import threading
from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from itertools import product
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from app.core.auth import require_internal_key
from app.core.config import Settings, get_settings
from app.core.db import get_conn
from app.schemas.backtest import (
    AssetsBatchRequest,
    AssetsBatchResult,
    BacktestRequest,
    BacktestResult,
    BatchItem,
    BatchRequest,
    BatchResult,
    McPathsBatchRequest,
    McPathsResult,
    SensitivityBatchRequest,
    SensitivityCell,
    SensitivityResult,
    StrategyConfig,
    TimeframeItem,
    TimeframesBatchRequest,
    TimeframesResult,
    WindowItem,
    WindowsBatchRequest,
    WindowsResult,
)
from app.services.candles import (
    TIMEFRAME_SPAN,
    AssetRef,
    InvalidRangeError,
    Timeframe,
    get_asset_ref,
    get_candles,
)
from app.strategies.engine import simulate, to_result, warmup_candles
from app.strategies.montecarlo import MIN_CANDLES as MC_MIN_CANDLES
from app.strategies.montecarlo import run_paths, seed_of
from app.strategies.robustness import (
    LEVELS,
    MIN_CANDLES,
    Variant,
    axis_of,
    chosen_timeframes,
    estimate_candles,
    price_line,
    run_many,
    summarize,
    tunables,
    vary,
    window_bounds,
)
from app.strategies.validation import find_conflicts

router = APIRouter(prefix="/backtests", tags=["backtests"])

# Earliest date any listed pair can have candles; rejects absurd ranges before any work.
MIN_DATE = date(2009, 1, 1)

# Caps simultaneous CPU-bound simulations. Sized once (settings are cached for the process).
_slots = threading.BoundedSemaphore(get_settings().max_concurrent_backtests)
# Batches are heavier: they get their own gate on top of `_slots` (held for the whole loop).
_batch_slots = threading.BoundedSemaphore(get_settings().max_concurrent_batches)
# Monte Carlo over synthetic paths is the heaviest kind: its own gate, apart from the other batches.
_mc_slots = threading.BoundedSemaphore(get_settings().max_concurrent_mc)

# The work of a batch, prepared (validated, assets found) before it takes a slot.
Job = Callable[[], BatchResult]


def check_range(from_: date, to: date, timeframe: Timeframe, max_candles: int, today: date) -> None:
    """Rejects ranges that are inverted, outside real history or too long for the timeframe."""
    if from_ > to:
        raise HTTPException(422, "`from` must not be after `to`")
    if from_ < MIN_DATE:
        raise HTTPException(422, f"`from` must not be before {MIN_DATE.isoformat()}")
    if to > today + timedelta(days=1):  # one day of slack for clients ahead of UTC
        raise HTTPException(422, "`to` must not be in the future")
    candles = ((to - from_).days + 1) * 86_400 / TIMEFRAME_SPAN[timeframe].total_seconds()
    if candles > max_candles:
        raise HTTPException(
            422, f"Range too long for {timeframe}: at most {max_candles} candles per backtest"
        )


def _simulate(
    conn: Connection,
    asset: AssetRef,
    strategy: StrategyConfig,
    timeframe: Timeframe,
    from_: date,
    to: date,
) -> BacktestResult:
    """Reads the asset's candles (with indicator warm-up before `from_`) and runs the strategy."""
    start = datetime.combine(from_, time.min, UTC)
    end = datetime.combine(to + timedelta(days=1), time.min, UTC)  # exclusive
    history_start = datetime.combine(asset.history_since, time.min, UTC)
    warmup = warmup_candles(strategy) * TIMEFRAME_SPAN[timeframe]
    fetch_start = max(start - warmup, history_start)

    df = get_candles(conn, asset, timeframe, fetch_start, end)
    df = df[df.index < end]
    return to_result(simulate(df, strategy, start, timeframe))


@router.post("/run", dependencies=[Depends(require_internal_key)])
def run_backtest(
    req: BacktestRequest, conn: Annotated[Connection, Depends(get_conn)]
) -> BacktestResult:
    """Stateless: runs the given strategy over real candles; nothing is stored.

    Callable only by the web app (internal key), which enforces the per-user quotas.
    """
    settings = get_settings()
    check_range(
        req.from_, req.to, req.timeframe, settings.max_backtest_candles, datetime.now(UTC).date()
    )
    asset = get_asset_ref(conn, req.symbol)
    if asset is None:
        raise HTTPException(404, "Asset not found")
    conflicts = find_conflicts(req.strategy)
    if conflicts:
        raise HTTPException(422, [c.message for c in conflicts])

    if not _slots.acquire(timeout=settings.backtest_queue_timeout_seconds):
        raise HTTPException(
            503, "Too many backtests running, try again shortly", {"Retry-After": "5"}
        )
    try:
        return _simulate(conn, asset, req.strategy, req.timeframe, req.from_, req.to)
    finally:
        _slots.release()


@router.post("/batch", dependencies=[Depends(require_internal_key)])
def run_batch(req: BatchRequest, conn: Annotated[Connection, Depends(get_conn)]) -> BatchResult:
    """Several simulations of one strategy: over assets, rolling windows, parameters or timeframes.

    Candles are read once per asset (per timeframe for `timeframes`). The work (`candles x
    simulations`) is budgeted before any of it starts, and only one batch runs at a time. A
    simulation that can't run (too little history in its range) is reported in its own item; the
    others still run.
    """
    settings = get_settings()
    check_range(
        req.from_, req.to, req.timeframe, settings.max_backtest_candles, datetime.now(UTC).date()
    )
    prepare = {
        "assets": _prepare_assets,
        "windows": _prepare_windows,
        "sensitivity": _prepare_sensitivity,
        "timeframes": _prepare_timeframes,
        "mc-paths": _prepare_mc_paths,
    }[req.kind]
    job = prepare(req, conn, settings)  # type: ignore[arg-type]
    conflicts = find_conflicts(req.strategy)
    if conflicts:
        raise HTTPException(422, [c.message for c in conflicts])

    busy = HTTPException(503, "Too many backtests running, try again shortly", {"Retry-After": "5"})
    gate = _mc_slots if req.kind == "mc-paths" else _batch_slots
    if not gate.acquire(blocking=False):
        raise busy
    try:
        if not _slots.acquire(timeout=settings.backtest_queue_timeout_seconds):
            raise busy
        try:
            return job()
        finally:
            _slots.release()
    finally:
        gate.release()


def _over_budget(settings: Settings, simulations: int, candles: float, what: str) -> None:
    if candles * simulations > settings.max_batch_work:
        raise HTTPException(
            422,
            f"Batch too large: {what} x {int(candles)} candles exceeds "
            f"the work budget of {settings.max_batch_work} candles",
        )


def _get_asset(conn: Connection, symbol: str) -> AssetRef:
    asset = get_asset_ref(conn, symbol)
    if asset is None:
        raise HTTPException(404, f"Asset not found: {symbol.upper()}")
    return asset


def _prepare_assets(req: AssetsBatchRequest, conn: Connection, settings: Settings) -> Job:
    if len(req.symbols) > settings.max_batch_items:
        raise HTTPException(422, f"At most {settings.max_batch_items} assets per batch")
    candles = estimate_candles(req.from_, req.to, req.timeframe)
    _over_budget(settings, len(req.symbols), candles, f"{len(req.symbols)} assets")
    assets = [(symbol.upper(), _get_asset(conn, symbol)) for symbol in req.symbols]

    def job() -> AssetsBatchResult:
        items = []
        for symbol, asset in assets:
            try:
                result = _simulate(conn, asset, req.strategy, req.timeframe, req.from_, req.to)
            except InvalidRangeError:
                items.append(BatchItem(symbol=symbol, error="no-candles"))
                continue
            items.append(BatchItem(symbol=symbol, result=result, starts_at=result.candles[0].time))
        return AssetsBatchResult(kind="assets", items=items)

    return job


def _read(
    conn: Connection,
    asset: AssetRef,
    warmup: int,
    timeframe: Timeframe,
    from_: date,
    to: date,
) -> tuple[pd.DataFrame, datetime, datetime]:
    """Candles of the range with `warmup` candles before it (as far back as the history goes)."""
    start = datetime.combine(from_, time.min, UTC)
    end = datetime.combine(to + timedelta(days=1), time.min, UTC)  # exclusive
    history_start = datetime.combine(asset.history_since, time.min, UTC)
    fetch_start = max(start - warmup * TIMEFRAME_SPAN[timeframe], history_start)
    df = get_candles(conn, asset, timeframe, fetch_start, end)
    return df[df.index < end], start, end


def _prepare_windows(req: WindowsBatchRequest, conn: Connection, settings: Settings) -> Job:
    windows = window_bounds(req.from_, req.to, req.length_days, req.step_days)
    if not windows:
        raise HTTPException(422, "The range is shorter than one window")
    if len(windows) > settings.max_batch_items:
        raise HTTPException(
            422, f"At most {settings.max_batch_items} windows per run (this one has {len(windows)})"
        )
    candles = req.length_days * 86_400 / TIMEFRAME_SPAN[req.timeframe].total_seconds()
    if candles < MIN_CANDLES:
        raise HTTPException(422, f"A window needs at least {MIN_CANDLES} candles: use a longer one")
    _over_budget(settings, len(windows), candles, f"{len(windows)} windows")
    asset = _get_asset(conn, req.symbol)

    def job() -> WindowsResult:
        df, start, end = _read(
            conn, asset, warmup_candles(req.strategy), req.timeframe, req.from_, req.to
        )
        variants = [
            Variant(
                req.strategy,
                datetime.combine(a, time.min, UTC),
                datetime.combine(b + timedelta(days=1), time.min, UTC),
            )
            for a, b in windows
        ]
        sims = run_many(df, req.timeframe, variants)
        items = [
            WindowItem(start=a, end=b, summary=summarize(sim))
            if sim
            else WindowItem(start=a, end=b, error="no-candles")
            for (a, b), sim in zip(windows, sims, strict=True)
        ]
        return WindowsResult(
            kind="windows",
            length_days=req.length_days,
            step_days=req.step_days,
            items=items,
            prices=price_line(df, start, end),
        )

    return job


def _prepare_sensitivity(req: SensitivityBatchRequest, conn: Connection, settings: Settings) -> Job:
    available = {p.id: p for p in tunables(req.strategy)}
    chosen = []
    for pid in req.params:
        if pid not in available:
            raise HTTPException(422, f"The strategy has no parameter {pid}")
        chosen.append(available[pid])
    cells = len(LEVELS) ** len(chosen)
    if cells > settings.max_batch_items:
        raise HTTPException(422, f"At most {settings.max_batch_items} variants per run")
    candles = estimate_candles(req.from_, req.to, req.timeframe)
    _over_budget(settings, cells, candles, f"{cells} variants")
    asset = _get_asset(conn, req.symbol)

    def job() -> SensitivityResult:
        typed = req.values or [None] * len(chosen)
        axes = [axis_of(p, v) for p, v in zip(chosen, typed, strict=True)]
        grid = list(product(range(len(LEVELS)), repeat=len(chosen)))
        values = [[a.values[k] for a, k in zip(axes, coords, strict=True)] for coords in grid]
        strategies: list[StrategyConfig | None] = []
        reasons: list[str | None] = []
        for vals in values:
            strategy = vary(req.strategy, list(zip(chosen, vals, strict=True)))
            if strategy is None:
                reasons.append("invalid")
            elif find_conflicts(strategy):
                strategy = None
                reasons.append("conflict")
            else:
                reasons.append(None)
            strategies.append(strategy)
        runnable = [s for s in strategies if s is not None]
        # A variant may need more warm-up than the base strategy (a longer period).
        warmup = max((warmup_candles(s) for s in runnable), default=0)
        df, start, end = _read(conn, asset, warmup, req.timeframe, req.from_, req.to)
        sims = iter(run_many(df, req.timeframe, [Variant(s, start, end) for s in runnable]))
        out = []
        for coords, vals, strategy, reason in zip(grid, values, strategies, reasons, strict=True):
            if strategy is None:
                out.append(SensitivityCell(coords=list(coords), values=vals, error=reason))
                continue
            sim = next(sims)
            if sim is None:
                out.append(SensitivityCell(coords=list(coords), values=vals, error="no-candles"))
            else:
                out.append(
                    SensitivityCell(coords=list(coords), values=vals, summary=summarize(sim))
                )
        return SensitivityResult(kind="sensitivity", axes=axes, cells=out)

    return job


def _prepare_timeframes(req: TimeframesBatchRequest, conn: Connection, settings: Settings) -> Job:
    frames = chosen_timeframes(
        req.timeframe, req.timeframes, req.from_, req.to, settings.max_backtest_candles
    )
    if len(frames) < 2:
        raise HTTPException(422, "No other timeframe suits this range")
    candles = sum(estimate_candles(req.from_, req.to, tf) for tf in frames)
    if candles > settings.max_batch_work:
        raise HTTPException(
            422,
            f"Batch too large: {len(frames)} timeframes ({int(candles)} candles) exceeds "
            f"the work budget of {settings.max_batch_work} candles",
        )
    asset = _get_asset(conn, req.symbol)

    def job() -> TimeframesResult:
        items = []
        for tf in frames:
            try:
                df, start, end = _read(
                    conn, asset, warmup_candles(req.strategy), tf, req.from_, req.to
                )
                (sim,) = run_many(df, tf, [Variant(req.strategy, start, end)])
            except InvalidRangeError:
                sim = None
            if sim is None:
                items.append(TimeframeItem(timeframe=tf, error="no-candles"))
            else:
                items.append(
                    TimeframeItem(
                        timeframe=tf, summary=summarize(sim), starts_at=sim.times[0].to_pydatetime()
                    )
                )
        return TimeframesResult(kind="timeframes", items=items)

    return job


def _prepare_mc_paths(req: McPathsBatchRequest, conn: Connection, settings: Settings) -> Job:
    if req.paths > settings.max_mc_paths:
        raise HTTPException(422, f"At most {settings.max_mc_paths} paths per run")
    candles = estimate_candles(req.from_, req.to, req.timeframe)
    if candles < MC_MIN_CANDLES:
        raise HTTPException(
            422, f"Monte Carlo needs at least {MC_MIN_CANDLES} candles in the range"
        )
    if candles * req.paths > settings.max_mc_work:
        raise HTTPException(
            422,
            f"Too much work: {req.paths} paths x {int(candles)} candles exceeds "
            f"the budget of {settings.max_mc_work} candles",
        )
    if req.block_length is not None and req.block_length > candles:
        raise HTTPException(422, "The block is longer than the range")
    asset = _get_asset(conn, req.symbol)

    def job() -> McPathsResult:
        df, start, _end = _read(
            conn, asset, warmup_candles(req.strategy), req.timeframe, req.from_, req.to
        )
        seed = (
            req.seed
            if req.seed is not None
            else seed_of(
                {
                    "symbol": req.symbol.upper(),
                    "timeframe": req.timeframe,
                    "from": req.from_,
                    "to": req.to,
                    "strategy": req.strategy.model_dump(mode="json"),
                    "paths": req.paths,
                    "block": req.block_length,
                }
            )
        )
        try:
            return run_paths(
                df, req.strategy, req.timeframe, start, req.paths, req.block_length, seed
            )
        except InvalidRangeError as error:
            raise HTTPException(422, "Not enough candles in the range") from error

    return job
