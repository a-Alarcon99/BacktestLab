from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Same files as the web app; later files take priority, so `.env.local` overrides `.env`.
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    database_url: str
    cors_origins: str = "http://localhost:3000"

    # Market data providers. Use https://data-api.binance.vision if api.binance.com is geo-blocked.
    binance_base_url: str = "https://api.binance.com"
    coingecko_base_url: str = "https://api.coingecko.com/api/v3"
    coingecko_api_key: str | None = None

    # Quotes are refreshed lazily on read once older than these TTLs.
    quote_ttl_seconds: int = 30
    market_cap_ttl_seconds: int = 3600
    # Stale-while-revalidate: a price snapshot at most this old is served as is while it is refreshed
    # in the background; older (or missing) ones are refreshed before answering.
    quote_max_stale_seconds: int = 900
    # `/health` warms quotes and stored candles in the background, at most this often.
    warmup_min_interval_seconds: int = 300
    # False: this process never calls Binance/CoinGecko and serves only what is stored (kept fresh
    # by `python -m app.sync` running elsewhere, see docs/12-sincronizacion-local.md).
    provider_fetch_enabled: bool = True
    # Pause between rounds of `python -m app.sync`.
    sync_interval_seconds: int = 15

    # Candle history: Parquet files in a Cloudflare R2 bucket (S3 API), see services/candle_store.py.
    # With no endpoint, `CANDLE_LOCAL_DIR` (same layout) is used instead: tests and local dev.
    r2_endpoint: str | None = None
    r2_bucket: str = "backtestlab-candles"
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    candle_local_dir: str | None = None
    # Disk cache of the Parquet files already read (closed months/years never change).
    candle_cache_dir: str = "/tmp/backtestlab-candles"
    candle_cache_max_mb: int = 300
    # How long the file of the month/year in progress is trusted before downloading it again.
    candle_open_file_ttl_seconds: int = 300
    # data.binance.vision: static CDN of Binance's historical klines, used by `python -m app.ingest`.
    binance_vision_url: str = "https://data.binance.vision"
    # Hot tail of 1m candles kept in Postgres (`candles_recent_1m`).
    recent_candles_hours: int = 72

    # Shared secret the web app sends in `X-Internal-Key` when it proxies a backtest. The web app
    # enforces the user quotas, so `/backtests/run` refuses any caller without it (and, unset,
    # refuses everyone). Generate one with `openssl rand -hex 32` and set the same value in both apps.
    internal_api_key: str | None = None

    # --- Abuse / cost protection (see SECURITY.md) ---
    # Set to false in production: hides /docs, /redoc and /openapi.json.
    docs_enabled: bool = True
    # Number of trusted reverse proxies in front of the API (0 = use the socket address).
    # Only then is X-Forwarded-For honoured; otherwise clients could spoof their IP.
    trusted_proxy_hops: int = 0
    rate_limit_enabled: bool = True
    # Per client IP.
    rate_limit_backtest_per_minute: int = 6
    rate_limit_backtest_per_hour: int = 60
    rate_limit_candles_per_minute: int = 60
    rate_limit_default_per_minute: int = 120
    # Across all clients: bounds distributed abuse (many IPs) on the expensive endpoint.
    rate_limit_backtest_global_per_minute: int = 60
    # Outbound calls to Binance/CoinGecko from this process, per minute (hard budget).
    provider_calls_per_minute: int = 300
    max_concurrent_backtests: int = 2
    backtest_queue_timeout_seconds: float = 10
    max_body_bytes: int = 64 * 1024
    # Candles a single backtest may simulate (range / timeframe), warm-up excluded.
    max_backtest_candles: int = 100_000
    db_pool_max_size: int = 8
    db_pool_timeout_seconds: float = 10
    db_statement_timeout_ms: int = 20_000

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
