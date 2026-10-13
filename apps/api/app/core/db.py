from collections.abc import Iterator

from psycopg import Connection
from psycopg_pool import ConnectionPool

from app.core.config import get_settings

# Sync pool: FastAPI runs sync dependencies/endpoints in a threadpool, which suits
# CPU-bound pandas work and avoids psycopg's async limitations on Windows.
# prepare_threshold=None: Supabase transaction pooler does not support prepared statements.
pool = ConnectionPool(
    conninfo=get_settings().database_url,
    kwargs={"prepare_threshold": None},
    open=False,
)


def get_conn() -> Iterator[Connection]:
    with pool.connection() as conn:
        yield conn
