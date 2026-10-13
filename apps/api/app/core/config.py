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

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
