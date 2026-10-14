from collections.abc import Iterator

from psycopg import Connection
from psycopg_pool import ConnectionPool

from app.core.config import get_settings

_settings = get_settings()

# Sync pool: FastAPI runs sync dependencies/endpoints in a threadpool, which suits
# CPU-bound pandas work and avoids psycopg's async limitations on Windows.
# prepare_threshold=None: Supabase transaction pooler does not support prepared statements.
# A bounded size + short wait turns saturation into a fast 503 instead of piling up requests.
pool = ConnectionPool(
    conninfo=_settings.database_url,
    kwargs={"prepare_threshold": None},
    min_size=1,
    max_size=_settings.db_pool_max_size,
    timeout=_settings.db_pool_timeout_seconds,
    open=False,
)


def get_conn() -> Iterator[Connection]:
    with pool.connection() as conn:
        # Transaction-local (the pooler shares sessions, so a session-level SET would leak):
        # caps runaway queries and lock waits for the statements of this transaction.
        conn.execute(
            "select set_config('statement_timeout', %s, true), set_config('lock_timeout', %s, true)",
            (str(_settings.db_statement_timeout_ms), str(_settings.db_statement_timeout_ms)),
        )
        yield conn
