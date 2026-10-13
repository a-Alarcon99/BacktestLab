"""HTTP clients for the market data providers: Binance (prices, candles) and CoinGecko (market cap)."""

import json
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache
from typing import Any

import httpx

from app.core.config import get_settings

BINANCE_KLINE_LIMIT = 1000
_MAX_RETRIES = 3


@dataclass(frozen=True)
class Ticker:
    price: float
    change_pct: float
    high: float
    low: float
    quote_volume: float


@dataclass(frozen=True)
class MarketCap:
    market_cap: float | None
    rank: int | None


@dataclass(frozen=True)
class Kline:
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@cache
def _client() -> httpx.Client:
    return httpx.Client(timeout=10)


def _get(url: str, params: dict[str, Any], headers: dict[str, str] | None = None) -> Any:
    """GET with backoff on rate limiting (429, and Binance's 418 IP ban), honouring Retry-After."""
    for attempt in range(_MAX_RETRIES + 1):
        res = _client().get(url, params=params, headers=headers)
        if res.status_code in (418, 429) and attempt < _MAX_RETRIES:
            time.sleep(min(int(res.headers.get("Retry-After", "1")), 60))
            continue
        res.raise_for_status()
        return res.json()
    raise AssertionError("unreachable")


def _binance(path: str, params: dict[str, Any]) -> Any:
    return _get(f"{get_settings().binance_base_url}{path}", params)


def _symbols_param(symbols: list[str]) -> str:
    return json.dumps(symbols, separators=(",", ":"))


def _parse_ticker(t: dict[str, Any]) -> Ticker:
    return Ticker(
        price=float(t["lastPrice"]),
        change_pct=float(t["priceChangePercent"]),
        high=float(t["highPrice"]),
        low=float(t["lowPrice"]),
        quote_volume=float(t["quoteVolume"]),
    )


def fetch_tickers_24h(symbols: list[str]) -> dict[str, Ticker]:
    data = _binance("/api/v3/ticker/24hr", {"symbols": _symbols_param(symbols)})
    return {t["symbol"]: _parse_ticker(t) for t in data}


def fetch_tickers_7d(symbols: list[str]) -> dict[str, Ticker]:
    """Rolling 7-day window ticker (max 100 symbols per call)."""
    data = _binance("/api/v3/ticker", {"symbols": _symbols_param(symbols), "windowSize": "7d"})
    return {t["symbol"]: _parse_ticker(t) for t in data}


def fetch_market_caps(coingecko_ids: list[str]) -> dict[str, MarketCap]:
    """Market cap and rank in USD (max 250 ids per call)."""
    settings = get_settings()
    key = settings.coingecko_api_key
    data = _get(
        f"{settings.coingecko_base_url}/coins/markets",
        {"vs_currency": "usd", "ids": ",".join(coingecko_ids), "per_page": 250},
        headers={"x-cg-demo-api-key": key} if key else None,
    )
    return {c["id"]: MarketCap(c.get("market_cap"), c.get("market_cap_rank")) for c in data}


def fetch_klines_1h(symbol: str, start: datetime, end: datetime) -> list[Kline]:
    """One page (up to 1000) of 1h candles with open_time in [start, end]."""
    data = _binance(
        "/api/v3/klines",
        {
            "symbol": symbol,
            "interval": "1h",
            "startTime": int(start.timestamp() * 1000),
            "endTime": int(end.timestamp() * 1000),
            "limit": BINANCE_KLINE_LIMIT,
        },
    )
    return [
        Kline(
            open_time=datetime.fromtimestamp(k[0] / 1000, UTC),
            open=float(k[1]),
            high=float(k[2]),
            low=float(k[3]),
            close=float(k[4]),
            volume=float(k[5]),
        )
        for k in data
    ]


def iter_klines_1h(symbol: str, start: datetime, end: datetime) -> Iterator[list[Kline]]:
    """Pages through Binance's 1000-candle limit: each page starts one hour after the last one."""
    cursor = start
    while cursor <= end:
        page = fetch_klines_1h(symbol, cursor, end)
        if not page:
            return
        yield page
        cursor = page[-1].open_time + timedelta(hours=1)
