from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest

from app.services.candles import (
    HOUR,
    last_closed_open_time,
    missing_ranges,
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


@pytest.mark.parametrize(
    ("timeframe", "expected"),
    [
        ("1h", dt(2026, 10, 8, 14)),
        ("4h", dt(2026, 10, 8, 12)),
        ("1d", dt(2026, 10, 8)),
        ("1w", dt(2026, 10, 5)),  # Monday
        ("1M", dt(2026, 10, 1)),
    ],
)
def test_period_start(timeframe, expected):
    assert period_start(dt(2026, 10, 8, 14, 37), timeframe) == expected


class TestMissingRanges:
    start, end = dt(2026, 1, 1), dt(2026, 4, 1)

    def test_nothing_stored(self):
        assert missing_ranges(self.start, self.end, None, None) == [(self.start, self.end)]

    def test_fully_covered(self):
        assert missing_ranges(self.start, self.end, dt(2025, 1, 1), dt(2026, 5, 1)) == []

    def test_extends_both_edges_only(self):
        stored_min, stored_max = dt(2026, 2, 1), dt(2026, 3, 1)
        assert missing_ranges(self.start, self.end, stored_min, stored_max) == [
            (self.start, stored_min - HOUR),
            (stored_max + HOUR, self.end),
        ]

    def test_empty_range(self):
        assert missing_ranges(self.end, self.start, None, None) == []


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
