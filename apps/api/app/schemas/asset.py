import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


def to_camel(name: str) -> str:
    # pydantic's to_camel turns "change_24h" into "change24H"; we want "change24h".
    return re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), name)


class CamelModel(BaseModel):
    """Serialized with camelCase keys to match the web app's TypeScript types."""

    # allow_inf_nan=False: `Infinity`/`NaN` in a request body would otherwise pass range checks.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, allow_inf_nan=False)


class Asset(CamelModel):
    symbol: str
    name: str
    rank: int | None
    category: str
    price: float
    change_24h: float
    change_7d: float
    volume_24h: float
    market_cap: float | None
    high_24h: float
    low_24h: float
    history_since: date
    updated_at: datetime


class Candle(CamelModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
