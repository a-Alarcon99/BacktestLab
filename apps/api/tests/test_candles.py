from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest

from app.services.candles import (
    BASE_FOR,
    BASE_STEP,
    TIMEFRAME_SPAN,
    last_closed_open_time,
    older_window,
    period_start,
    resample,
)


def dt(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def hourly(start: datetime, hours: int) -> pd.DataFrame:
    index = pd.date_range(start, periods=hours, freq="1h", tz=UTC, name="open_time")
    n = pd.Series(range(hours), index=index, dtype=float)
    return pd.DataFrame(
        {"open": n, "high": n + 0.5, "low": n - 0.5, "close": n + 0.25, "volume": 1.0}
    )


def test_last_closed_open_time():
    assert last_closed_open_time(dt(2026, 10, 9, 14, 37)) == dt(2026, 10, 9, 13)
    assert last_closed_open_time(dt(2026, 10, 9, 14, 37, 20), "1m") == dt(2026, 10, 9, 14, 36)
    assert last_closed_open_time(dt(2026, 10, 9, 14, 37), "15m") == dt(2026, 10, 9, 14, 15)


@pytest.mark.parametrize(
    ("timeframe", "expected"),
    [
        ("1m", dt(2026, 10, 8, 14, 37)),
        ("5m", dt(2026, 10, 8, 14, 35)),
        ("30m", dt(2026, 10, 8, 14, 30)),
        ("1h", dt(2026, 10, 8, 14)),
        ("2h", dt(2026, 10, 8, 14)),
        ("4h", dt(2026, 10, 8, 12)),
        ("1d", dt(2026, 10, 8)),
        ("1w", dt(2026, 10, 5)),  # Monday
        ("1M", dt(2026, 10, 1)),
    ],
)
def test_period_start(timeframe, expected):
    assert period_start(dt(2026, 10, 8, 14, 37), timeframe) == expected


def test_resample_4h_aggregates_ohlcv():
    df = resample(hourly(dt(2026, 1, 1), 8), "4h", until=dt(2026, 1, 1, 8))

    assert list(df.index) == [dt(2026, 1, 1, 0), dt(2026, 1, 1, 4)]
    first = df.iloc[0]
    assert (first.open, first.high, first.low, first.close, first.volume) == (0, 3.5, -0.5, 3.25, 4)


def test_resample_drops_trailing_partial_period():
    # 2.5 days of data -> only 2 complete daily candles.
    df = resample(hourly(dt(2026, 1, 1), 60), "1d", until=dt(2026, 1, 3, 12))
    assert list(df.index) == [dt(2026, 1, 1), dt(2026, 1, 2)]


def test_resample_weeks_start_on_monday():
    # 2026-01-05 is a Monday; 14 days of data -> 2 weeks.
    df = resample(hourly(dt(2026, 1, 5), 24 * 14), "1w", until=dt(2026, 1, 19))
    assert list(df.index) == [dt(2026, 1, 5), dt(2026, 1, 12)]
    assert df.iloc[0].volume == 24 * 7


def test_resample_calendar_months():
    # Jan (31d) + Feb (28d) complete, March partial.
    df = resample(hourly(dt(2026, 1, 1), 24 * 70), "1M", until=dt(2026, 3, 12))
    assert list(df.index) == [dt(2026, 1, 1), dt(2026, 2, 1)]
    assert df.volume.tolist() == [24 * 31, 24 * 28]


def test_resample_1h_keeps_all_closed_candles():
    df = resample(hourly(dt(2026, 1, 1), 5), "1h", until=dt(2026, 1, 1, 5))
    assert len(df) == 5


def test_resample_skips_periods_without_data():
    df = pd.concat([hourly(dt(2026, 1, 1), 24), hourly(dt(2026, 1, 3), 24)])
    out = resample(df, "1d", until=dt(2026, 1, 4))
    assert list(out.index) == [dt(2026, 1, 1), dt(2026, 1, 3)]
    assert timedelta(days=2) == out.index[1] - out.index[0]


class TestOlderWindow:
    history = dt(2020, 1, 1)

    def test_page_ends_right_before_the_known_candle(self):
        start, end = older_window(dt(2026, 6, 1, 12), "1h", 100, self.history)
        assert end == dt(2026, 6, 1, 11)
        assert start == dt(2026, 5, 28, 8)

    def test_clamped_to_history_start(self):
        start, end = older_window(dt(2020, 1, 3), "1d", 1000, self.history)
        assert (start, end) == (self.history, dt(2020, 1, 2, 23))

    def test_short_remainder_is_widened_to_the_minimum_range(self):
        start, end = older_window(dt(2020, 1, 1, 6), "1h", 1000, self.history)
        assert end == dt(2020, 1, 1, 5)
        assert end - start >= timedelta(days=1)

    def test_none_at_start_of_history(self):
        assert older_window(self.history, "1d", 1000, self.history) is None

    def test_minute_timeframes_page_by_their_base_candle(self):
        start, end = older_window(dt(2026, 6, 1, 12), "5m", 1000, self.history)
        assert end == dt(2026, 6, 1, 11, 59)  # last 1m candle before the known one
        assert end - start >= timedelta(days=1)

    def test_thirty_minutes_end_on_a_15m_candle(self):
        _, end = older_window(dt(2026, 6, 1, 12), "30m", 1000, self.history)
        assert end == dt(2026, 6, 1, 11, 45)


def minutely(start: datetime, minutes: int) -> pd.DataFrame:
    index = pd.date_range(start, periods=minutes, freq="1min", tz=UTC, name="open_time")
    n = pd.Series(range(minutes), index=index, dtype=float)
    return pd.DataFrame(
        {"open": n, "high": n + 0.5, "low": n - 0.5, "close": n + 0.25, "volume": 1.0}
    )


def test_resample_5m_from_1m():
    df = resample(minutely(dt(2026, 1, 1), 12), "5m", until=dt(2026, 1, 1, 0, 12))
    assert list(df.index) == [dt(2026, 1, 1, 0, 0), dt(2026, 1, 1, 0, 5)]  # 00:10 is partial
    first = df.iloc[0]
    assert (first.open, first.high, first.low, first.close, first.volume) == (0, 4.5, -0.5, 4.25, 5)


def test_resample_3m_from_1m_skips_a_gap():
    df = pd.concat([minutely(dt(2026, 1, 1), 3), minutely(dt(2026, 1, 1, 0, 9), 3)])
    out = resample(df, "3m", until=dt(2026, 1, 1, 0, 12))
    assert list(out.index) == [dt(2026, 1, 1, 0, 0), dt(2026, 1, 1, 0, 9)]


def test_resample_30m_from_15m():
    index = pd.date_range(dt(2026, 1, 1), periods=4, freq="15min", tz=UTC, name="open_time")
    df = pd.DataFrame(
        {
            "open": [1, 2, 3, 4.0],
            "high": [5, 9, 6, 7.0],
            "low": [1, 1, 0, 2.0],
            "close": [2, 3, 4, 5.0],
            "volume": 1.0,
        },
        index=index,
    )
    out = resample(df, "30m", until=dt(2026, 1, 1, 1))
    assert out.high.tolist() == [9, 7] and out.low.tolist() == [1, 0]
    assert out.open.tolist() == [1, 3] and out.close.tolist() == [3, 5]


def test_resample_stored_timeframe_is_passed_through():
    df = resample(minutely(dt(2026, 1, 1), 5), "1m", until=dt(2026, 1, 1, 0, 4))
    assert len(df) == 4  # the 5th candle closes after `until`


def test_base_for_is_the_largest_stored_timeframe_that_divides_each_one():
    for tf, base in BASE_FOR.items():
        assert TIMEFRAME_SPAN[tf] % BASE_STEP[base] == timedelta(0) or tf == "1M"
        assert base in BASE_STEP
