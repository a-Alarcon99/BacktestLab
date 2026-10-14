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
