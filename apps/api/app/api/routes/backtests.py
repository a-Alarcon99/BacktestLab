import threading
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from app.core.auth import require_internal_key
from app.core.config import get_settings
from app.core.db import get_conn
from app.schemas.backtest import BacktestRequest, BacktestResult
from app.services.candles import TIMEFRAME_SPAN, Timeframe, get_asset_ref, get_candles
from app.strategies.engine import simulate, to_result, warmup_candles
from app.strategies.validation import find_conflicts

router = APIRouter(prefix="/backtests", tags=["backtests"])

# Earliest date any listed pair can have candles; rejects absurd ranges before any work.
MIN_DATE = date(2009, 1, 1)

# Caps simultaneous CPU-bound simulations. Sized once (settings are cached for the process).
_slots = threading.BoundedSemaphore(get_settings().max_concurrent_backtests)


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
        start = datetime.combine(req.from_, time.min, UTC)
        end = datetime.combine(req.to + timedelta(days=1), time.min, UTC)  # exclusive
        history_start = datetime.combine(asset.history_since, time.min, UTC)
        warmup = warmup_candles(req.strategy) * TIMEFRAME_SPAN[req.timeframe]
        fetch_start = max(start - warmup, history_start)

        df = get_candles(conn, asset, req.timeframe, fetch_start, end)
        df = df[df.index < end]
        sim = simulate(df, req.strategy, start, req.timeframe)
        return to_result(sim)
    finally:
        _slots.release()
