from datetime import UTC, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from app.core.db import get_conn
from app.schemas.backtest import BacktestRequest, BacktestResult
from app.services.candles import Timeframe, get_asset_ref, get_candles
from app.strategies.engine import simulate, to_result, warmup_candles
from app.strategies.validation import find_conflicts

router = APIRouter(prefix="/backtests", tags=["backtests"])

# Upper bound of each candle's duration, to load enough warm-up history before the range.
TIMEFRAME_SPAN: dict[Timeframe, timedelta] = {
    "1h": timedelta(hours=1),
    "4h": timedelta(hours=4),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
    "1M": timedelta(days=31),
}


@router.post("/run")
def run_backtest(
    req: BacktestRequest, conn: Annotated[Connection, Depends(get_conn)]
) -> BacktestResult:
    """Stateless: runs the given strategy over real candles; nothing is stored."""
    asset = get_asset_ref(conn, req.symbol)
    if asset is None:
        raise HTTPException(404, "Asset not found")
    if req.from_ > req.to:
        raise HTTPException(422, "`from` must not be after `to`")
    conflicts = find_conflicts(req.strategy)
    if conflicts:
        raise HTTPException(422, [c.message for c in conflicts])

    start = datetime.combine(req.from_, time.min, UTC)
    end = datetime.combine(req.to + timedelta(days=1), time.min, UTC)  # exclusive
    history_start = datetime.combine(asset.history_since, time.min, UTC)
    warmup = warmup_candles(req.strategy) * TIMEFRAME_SPAN[req.timeframe]
    fetch_start = max(start - warmup, history_start)

    df = get_candles(conn, asset, req.timeframe, fetch_start, end)
    df = df[df.index < end]
    sim = simulate(df, req.strategy, start, req.timeframe)
    return to_result(sim, req.strategy.initial_capital)
