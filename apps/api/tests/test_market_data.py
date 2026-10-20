from datetime import UTC, datetime, timedelta
from itertools import pairwise

import httpx
import pytest

from app.services import market_data

HOUR_MS = 3_600_000


@pytest.fixture
def mock_http(monkeypatch):
    """Route provider requests to a handler; returns the list of requests made."""
    requests: list[httpx.Request] = []

    def install(handler):
        def recording(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return handler(request)

        client = httpx.Client(transport=httpx.MockTransport(recording))
        monkeypatch.setattr(market_data, "_client", lambda: client)
        return requests

    return install


def test_fetch_tickers_24h_parses_strings(mock_http):
    payload = [
        {
            "symbol": "BTCUSDT",
            "lastPrice": "64210.37",
            "priceChangePercent": "-1.120",
            "highPrice": "64980.10",
            "lowPrice": "62455.20",
            "quoteVolume": "28400000000.5",
        }
    ]
    requests = mock_http(lambda _: httpx.Response(200, json=payload))

    tickers = market_data.fetch_tickers_24h(["BTCUSDT"])

    assert tickers["BTCUSDT"] == market_data.Ticker(
        64210.37, -1.12, 64980.1, 62455.2, 28400000000.5
    )
    assert requests[0].url.params["symbols"] == '["BTCUSDT"]'


def test_fetch_market_caps_sends_demo_key(mock_http, monkeypatch):
    monkeypatch.setattr(market_data.get_settings(), "coingecko_api_key", "demo-key")
    payload = [{"id": "bitcoin", "market_cap": 1.26e12, "market_cap_rank": 1}]
    requests = mock_http(lambda _: httpx.Response(200, json=payload))

    caps = market_data.fetch_market_caps(["bitcoin", "ethereum"])

    assert caps == {"bitcoin": market_data.MarketCap(1.26e12, 1)}
    assert requests[0].headers["x-cg-demo-api-key"] == "demo-key"
    assert requests[0].url.params["ids"] == "bitcoin,ethereum"


def test_retries_on_rate_limit(mock_http, monkeypatch):
    monkeypatch.setattr(market_data.time, "sleep", lambda _: None)
    responses = iter(
        [httpx.Response(429, headers={"Retry-After": "2"}), httpx.Response(200, json=[])]
    )
    requests = mock_http(lambda _: next(responses))

    assert market_data.fetch_tickers_24h(["BTCUSDT"]) == {}
    assert len(requests) == 2


def _fake_binance_klines(first: datetime, last: datetime):
    """Serves hourly klines between `first` and `last`, honouring startTime/endTime/limit."""
    first_ms, last_ms = int(first.timestamp() * 1000), int(last.timestamp() * 1000)

    def handler(request: httpx.Request) -> httpx.Response:
        p = request.url.params
        lo = max(int(p["startTime"]), first_ms)
        lo += -lo % HOUR_MS
        hi = min(int(p["endTime"]), last_ms)
        times = list(range(lo, hi + 1, HOUR_MS))[: int(p["limit"])]
        return httpx.Response(
            200, json=[[t, "1", "2", "0.5", "1.5", "10", t + HOUR_MS - 1] for t in times]
        )

    return handler


def test_iter_klines_pages_through_the_1000_limit(mock_http):
    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = start + timedelta(hours=2_499)  # 2,500 candles -> 1000 + 1000 + 500
    requests = mock_http(_fake_binance_klines(start, end))

    pages = list(market_data.iter_klines("BTCUSDT", "1h", timedelta(hours=1), start, end))

    assert [len(p) for p in pages] == [1000, 1000, 500]
    times = [k.open_time for page in pages for k in page]
    assert times[0] == start and times[-1] == end
    assert all(b - a == timedelta(hours=1) for a, b in pairwise(times))
    assert len(requests) == 3


def test_backoff_is_exponential_without_retry_after_and_capped():
    assert [market_data._retry_after(None, a) for a in range(4)] == [1, 2, 4, 5]
    assert market_data._retry_after("3", 0) == 3
    assert market_data._retry_after("3600", 0) == market_data._MAX_BACKOFF_SECONDS
    assert market_data._retry_after("soon", 1) == 2


def test_ip_ban_is_not_retried_and_skips_the_host_until_it_ends(mock_http, monkeypatch):
    monkeypatch.setattr(market_data, "_banned_until", {})
    clock = [1000.0]
    monkeypatch.setattr(market_data.time, "monotonic", lambda: clock[0])
    requests = mock_http(lambda _: httpx.Response(418, headers={"Retry-After": "120"}))
    start = datetime(2024, 1, 1, tzinfo=UTC)

    with pytest.raises(httpx.HTTPStatusError):
        market_data.fetch_klines("BTCUSDT", "1h", start, start)
    assert len(requests) == 1  # retrying during a ban makes Binance extend it

    with pytest.raises(market_data.ProviderBannedError):
        market_data.fetch_tickers_24h(["BTCUSDT"])
    assert len(requests) == 1

    clock[0] += 121
    with pytest.raises(httpx.HTTPStatusError):
        market_data.fetch_klines("BTCUSDT", "1h", start, start)
    assert len(requests) == 2


def test_iter_klines_fails_when_a_page_does_not_advance(mock_http):
    start = datetime(2026, 1, 1, tzinfo=UTC)
    stale = [[int(start.timestamp() * 1000) - HOUR_MS, "1", "2", "0.5", "1.5", "10", 0]]
    requests = mock_http(lambda _: httpx.Response(200, json=stale))

    with pytest.raises(httpx.HTTPError):
        list(
            market_data.iter_klines(
                "BTCUSDT", "1h", timedelta(hours=1), start, start + timedelta(hours=5)
            )
        )
    assert len(requests) == 1


def test_iter_klines_request_count_is_bounded_by_the_range(mock_http):
    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = start + timedelta(hours=2_499)

    def one_candle_per_page(request: httpx.Request) -> httpx.Response:
        t = int(request.url.params["startTime"])
        return httpx.Response(200, json=[[t, "1", "2", "0.5", "1.5", "10", t + HOUR_MS - 1]])

    requests = mock_http(one_candle_per_page)

    with pytest.raises(httpx.HTTPError):
        list(market_data.iter_klines("BTCUSDT", "1h", timedelta(hours=1), start, end))
    assert len(requests) == 4  # 2,500 candles need 3 pages of 1000, plus one of slack


def test_iter_klines_stops_when_binance_has_no_data(mock_http):
    listed = datetime(2026, 1, 1, 4, tzinfo=UTC)
    start = datetime(2026, 1, 1, tzinfo=UTC)
    requests = mock_http(_fake_binance_klines(listed, listed - timedelta(hours=1)))  # nothing

    assert (
        list(
            market_data.iter_klines(
                "BTCUSDT", "1h", timedelta(hours=1), start, start + timedelta(hours=3)
            )
        )
        == []
    )
    assert len(requests) == 1
