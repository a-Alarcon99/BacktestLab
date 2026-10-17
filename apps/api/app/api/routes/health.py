from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends
from psycopg import Connection

from app.core.db import get_conn
from app.services.warmup import warm_market_data

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(background: BackgroundTasks) -> dict[str, str]:
    # Besides waking the instance (free Render plans sleep when idle), each ping warms the market
    # data after the response is sent. The warm-up is throttled and takes no input.
    background.add_task(warm_market_data)
    return {"status": "ok"}


@router.get("/health/db")
def health_db(conn: Annotated[Connection, Depends(get_conn)]) -> dict[str, str]:
    conn.execute("select 1")
    return {"status": "ok", "database": "connected"}
