from typing import Annotated

from fastapi import APIRouter, Depends
from psycopg import Connection

from app.core.db import get_conn

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
def health_db(conn: Annotated[Connection, Depends(get_conn)]) -> dict[str, str]:
    conn.execute("select 1")
    return {"status": "ok", "database": "connected"}
