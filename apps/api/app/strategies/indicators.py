"""Technical indicators over pandas Series. Values are NaN until enough candles are available."""

import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def rsi(close: pd.Series, period: int) -> pd.Series:
    """Wilder's RSI (smoothed averages of gains and losses)."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    # No losses -> RSI 100; a flat market (no gains nor losses) stays NaN.
    return 100 - 100 / (1 + avg_gain / avg_loss)


def macd(close: pd.Series, fast: int, slow: int, signal: int) -> tuple[pd.Series, pd.Series]:
    """MACD line and its signal line."""
    line = ema(close, fast) - ema(close, slow)
    return line, ema(line, signal)


def bollinger(close: pd.Series, period: int, std_dev: float) -> tuple[pd.Series, pd.Series]:
    """Lower and upper bands (population standard deviation)."""
    mid = sma(close, period)
    width = close.rolling(period).std(ddof=0) * std_dev
    return mid - width, mid + width


def donchian(high: pd.Series, low: pd.Series, period: int) -> tuple[pd.Series, pd.Series]:
    """Lowest low and highest high of the previous `period` candles (current one excluded)."""
    return low.rolling(period).min().shift(1), high.rolling(period).max().shift(1)


def crosses_above(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a > b) & (a.shift(1) <= b.shift(1))


def crosses_below(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a < b) & (a.shift(1) >= b.shift(1))
