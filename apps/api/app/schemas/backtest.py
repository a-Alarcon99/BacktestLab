from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.schemas.asset import CamelModel
from app.services.candles import Timeframe

# Mirrors `apps/web/src/lib/strategy.ts`. Unknown fields (id, name, timestamps…) are ignored.

Period = Annotated[int, Field(ge=2, le=200)]
Op = Literal["above", "below"]
Direction = Literal["up", "down"]
Trend = Literal["any", "up", "down"]


class ConditionOptions(CamelModel):
    """Second level of settings every condition shares (all optional, off by default)."""

    # Market direction the condition needs: "up" = close above its EMA(`trend_period`), "down" = below.
    trend: Trend = "any"
    trend_period: int = Field(default=50, ge=2, le=400)
    # The signal stays active for this many candles after it happens (1 = only on that candle).
    lasts: int = Field(default=1, ge=1, le=50)


class RsiCondition(ConditionOptions):
    kind: Literal["rsi"]
    period: Period
    op: Op
    value: float = Field(gt=0, lt=100)


class MaCrossCondition(ConditionOptions):
    kind: Literal["ma-cross"]
    ma: Literal["sma", "ema"]
    fast: Period
    slow: Period
    direction: Direction

    @model_validator(mode="after")
    def _fast_below_slow(self) -> Self:
        if self.fast >= self.slow:
            raise ValueError("The fast average must be shorter than the slow one")
        return self


class MacdCondition(ConditionOptions):
    kind: Literal["macd"]
    fast: Period
    slow: Period
    signal: Period
    direction: Direction

    @model_validator(mode="after")
    def _fast_below_slow(self) -> Self:
        if self.fast >= self.slow:
            raise ValueError("The fast average must be shorter than the slow one")
        return self


class BollingerCondition(ConditionOptions):
    kind: Literal["bollinger"]
    period: Period
    std_dev: float = Field(ge=0.5, le=5)
    band: Literal["upper", "lower"]


class DonchianCondition(ConditionOptions):
    kind: Literal["donchian"]
    period: Period
    direction: Direction


class PriceChangeCondition(ConditionOptions):
    kind: Literal["price-change"]
    direction: Direction
    pct: float = Field(gt=0, le=1000)
    # Candles back, or "entry" (average buy price of the open position).
    lookback: Annotated[int, Field(ge=1, le=200)] | Literal["entry"]


class VolumeCondition(ConditionOptions):
    kind: Literal["volume"]
    op: Op
    multiple: float = Field(gt=0, le=100)
    period: Period


class PeriodicCondition(ConditionOptions):
    kind: Literal["periodic"]
    every: Literal["day", "week", "month"]


PatternId = Literal[
    "hammer",
    "bullish-engulfing",
    "morning-star",
    "piercing-line",
    "three-white-soldiers",
    "shooting-star",
    "bearish-engulfing",
    "evening-star",
    "dark-cloud-cover",
    "three-black-crows",
]


class CandlePatternCondition(ConditionOptions):
    kind: Literal["candle-pattern"]
    # Detectors live in `app/strategies/patterns.py`.
    pattern: PatternId


Condition = Annotated[
    RsiCondition
    | MaCrossCondition
    | MacdCondition
    | BollingerCondition
    | DonchianCondition
    | PriceChangeCondition
    | VolumeCondition
    | PeriodicCondition
    | CandlePatternCondition,
    Field(discriminator="kind"),
]


class OrderSize(CamelModel):
    # Buy: % of the available cash or a fixed USDT amount. Sell: % of the position.
    unit: Literal["pct", "usdt"]
    value: float = Field(gt=0, le=1_000_000_000)


class Rule(CamelModel):
    id: str = Field(min_length=1, max_length=64)
    side: Literal["buy", "sell"]
    conditions: list[Condition] = Field(min_length=1, max_length=3)
    size: OrderSize

    @model_validator(mode="after")
    def _valid_size(self) -> Self:
        if self.side == "sell" and self.size.unit != "pct":
            raise ValueError("Sell rules are sized as a % of the position")
        if self.size.unit == "pct" and self.size.value > 100:
            raise ValueError("A percentage size cannot exceed 100")
        return self


class StrategyConfig(CamelModel):
    initial_capital: float = Field(gt=0, le=1_000_000_000)
    fee_pct: float = Field(ge=0, le=5)
    rules: list[Rule] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def _has_buy_rule(self) -> Self:
        if not any(r.side == "buy" for r in self.rules):
            raise ValueError("The strategy needs at least one buy rule")
        return self


class BacktestRequest(CamelModel):
    symbol: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9]+$")
    timeframe: Timeframe
    # Inclusive range of whole UTC days.
    from_: date = Field(alias="from")
    to: date
    strategy: StrategyConfig


class _BatchBase(CamelModel):
    timeframe: Timeframe
    from_: date = Field(alias="from")
    to: date
    strategy: StrategyConfig


Symbol = Annotated[str, Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9]+$")]


class AssetsBatchRequest(_BatchBase):
    """Same strategy over several assets, each with the full capital (independent runs)."""

    kind: Literal["assets"]
    symbols: list[Symbol] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def _distinct_symbols(self) -> Self:
        if len({s.upper() for s in self.symbols}) != len(self.symbols):
            raise ValueError("Symbols must be distinct")
        return self


class WindowsBatchRequest(_BatchBase):
    """Rolling windows: the strategy restarts (full capital) on each `length_days` slice."""

    kind: Literal["windows"]
    symbol: Symbol
    length_days: int = Field(ge=2, le=3650)
    step_days: int = Field(ge=1, le=3650)


class SensitivityBatchRequest(_BatchBase):
    """The strategy with one or two of its parameters varied around their values."""

    kind: Literal["sensitivity"]
    symbol: Symbol
    # Ids from `robustness.tunables` ("<rule>:<condition>:<field>", indices in the rules).
    params: list[Annotated[str, Field(max_length=64)]] = Field(min_length=1, max_length=2)
    # The five values to try of each parameter, same order as `params` (default ±10 % steps).
    values: list[list[Annotated[float, Field(ge=0, le=1_000_000)]]] | None = None

    @model_validator(mode="after")
    def _distinct_params(self) -> Self:
        if len(set(self.params)) != len(self.params):
            raise ValueError("Parameters must be distinct")
        if self.values is not None and (
            len(self.values) != len(self.params) or any(len(v) != 5 for v in self.values)
        ):
            raise ValueError("Five values per parameter")
        return self


class TimeframesBatchRequest(_BatchBase):
    """The same range on `timeframe` and on `timeframes` (its neighbours when omitted)."""

    kind: Literal["timeframes"]
    symbol: Symbol
    # The timeframes to compare besides `timeframe`, which always takes part.
    timeframes: list[Timeframe] | None = Field(default=None, min_length=1, max_length=5)

    @model_validator(mode="after")
    def _distinct_timeframes(self) -> Self:
        if self.timeframes is not None and len(set(self.timeframes)) != len(self.timeframes):
            raise ValueError("Timeframes must be distinct")
        return self


class McPathsBatchRequest(_BatchBase):
    """Monte Carlo: the strategy on `paths` synthetic price histories made of blocks of real candles."""

    kind: Literal["mc-paths"]
    symbol: Symbol
    paths: int = Field(ge=10, le=1000)
    # Consecutive candles moved together; None = about the square root of the candles.
    block_length: int | None = Field(default=None, ge=1, le=1000)
    # None = derived from the request, so the same request always gives the same paths.
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)


BatchRequest = Annotated[
    AssetsBatchRequest
    | WindowsBatchRequest
    | SensitivityBatchRequest
    | TimeframesBatchRequest
    | McPathsBatchRequest,
    Field(discriminator="kind"),
]


class ReplayCandle(CamelModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float


class Trade(CamelModel):
    # Open time of the candle the order filled on (at its open price).
    time: datetime
    # Open time of the candle whose close gave the signal (the one before `time`).
    signal_time: datetime
    # Index in `BacktestResult.candles` (display buckets).
    index: int
    side: Literal["buy", "sell"]
    price: float
    quantity: float
    # USDT spent (buy, fee included) or received (sell, fee deducted).
    amount: float
    # Realized PnL of a sell (proceeds minus the share of the position's cost).
    pnl: float | None = None
    # `Rule.id` of the rule that placed the order.
    rule_id: str
    # Index in `BacktestResult.round_trips` of the trade this order belongs to.
    round_trip: int


class BacktestStats(CamelModel):
    # Orders.
    buys: int
    sells: int
    trades: int
    # Closed round trips (from flat to flat), the unit of the win rate.
    round_trips: int
    realized_pnl: float
    # Open position valued at what selling it at the last close would return (fee deducted).
    unrealized_pnl: float
    return_pct: float
    benchmark_return_pct: float
    win_rate_pct: float
    max_drawdown_pct: float
    sharpe: float
    final_capital: float
    open_position: bool


class RoundTrip(CamelModel):
    """One trade from flat to flat; an open one is valued at the last close (exit fee deducted)."""

    # Display indices (buckets) of the first buy and the closing sell (last candle if open).
    entry_index: int
    exit_index: int
    entry_time: datetime
    exit_time: datetime | None
    # Average fill prices (fees excluded); `exit_price` is the last close while open.
    entry_price: float
    exit_price: float
    # USDT spent on the buys, fees included.
    invested: float
    pnl: float
    pnl_pct: float
    # Candles held and the same in seconds.
    bars: int
    duration_seconds: float
    exit_rule_id: str | None
    open: bool
    # Deepest fall of the price below the entry price while held (<= 0, %).
    worst_pct: float
    buys: int
    sells: int


class DrawdownPeriod(CamelModel):
    """Longest time spent below a previous equity peak."""

    start_index: int
    end_index: int
    start_time: datetime
    end_time: datetime
    candles: int
    seconds: float
    # False when the equity never got back to the peak before the end.
    recovered: bool
    depth_pct: float


class PeriodReturn(CamelModel):
    start: date
    return_pct: float
    benchmark_pct: float


class PeriodReturns(CamelModel):
    unit: Literal["day", "week", "month", "quarter", "year"]
    items: list[PeriodReturn]


class BacktestMetrics(CamelModel):
    """Report figures, computed at full resolution. `None` = not defined for this run."""

    days: float
    net_profit: float
    return_pct: float
    benchmark_return_pct: float
    # Return minus the benchmark's, in percentage points.
    excess_return_pct: float
    max_drawdown_pct: float
    benchmark_max_drawdown_pct: float
    # Display index of the bottom of the deepest drawdown.
    max_drawdown_index: int | None
    longest_drawdown: DrawdownPeriod | None
    round_trips: int
    wins: int
    losses: int
    win_rate_pct: float
    profit_factor: float | None
    avg_win_pct: float | None
    avg_loss_pct: float | None
    payoff_ratio: float | None
    expectancy_pct: float | None
    expectancy_usdt: float | None
    best_trade_pct: float | None
    worst_trade_pct: float | None
    # Share of the closed trades' total profit made by the best one (%).
    best_trade_share_pct: float | None
    max_win_streak: int
    max_loss_streak: int
    avg_bars: float | None
    avg_duration_seconds: float | None
    # Candles with an open position, % of the range.
    exposure_pct: float
    fees_paid: float
    trades_per_month: float
    cagr_pct: float | None
    sharpe: float | None
    sortino: float | None
    calmar: float | None
    volatility_pct: float | None


class BacktestResult(CamelModel):
    # Real number of candles simulated; `candles` is downsampled to at most MAX_DISPLAY_CANDLES.
    candle_count: int
    candles: list[ReplayCandle]
    trades: list[Trade]
    # Per display candle, cumulative up to and including it.
    buys: list[int]
    sells: list[int]
    realized: list[float]
    # Liquidation value (an open position sold at the close, fee deducted) at the end of each
    # display candle, and the same for buying at the first open and holding (`benchmark`).
    equity: list[float]
    benchmark: list[float]
    # Deepest fall below the previous peak inside each display candle (%, positive).
    drawdown: list[float]
    benchmark_drawdown: list[float]
    # Short equity curve normalized to 100, for list sparklines.
    equity_curve: list[float]
    round_trips: list[RoundTrip]
    periods: PeriodReturns
    metrics: BacktestMetrics
    stats: BacktestStats


class BatchItem(CamelModel):
    """Outcome for one asset. `error` is set (and `result` is None) when it could not run."""

    symbol: str
    result: BacktestResult | None = None
    # "no-candles": not enough candles in the range for this asset (e.g. listed later).
    error: Literal["no-candles"] | None = None
    # First candle simulated (UTC); later than the requested start when the history begins later.
    starts_at: datetime | None = None


class AssetsBatchResult(CamelModel):
    kind: Literal["assets"]
    items: list[BatchItem]


class OrderMark(CamelModel):
    at: float
    side: Literal["buy", "sell"]


class RunSummary(CamelModel):
    """Figures of one simulation without the replay data (robustness tests run many of them)."""

    return_pct: float
    benchmark_return_pct: float
    max_drawdown_pct: float
    orders: int
    round_trips: int
    win_rate_pct: float
    sharpe: float
    candle_count: int
    final_capital: float = 0
    # None when it is not defined (no losing trade, no closed trade).
    profit_factor: float | None = None
    # Candles with an open position, % of the range.
    exposure_pct: float = 0
    avg_trade_pct: float | None = None
    best_trade_pct: float | None = None
    worst_trade_pct: float | None = None
    # Equity of the strategy and of buying and holding, normalized to 100, at evenly spaced
    # points of the run (`CURVE_POINTS` of them).
    curve: list[float]
    benchmark_curve: list[float]
    # Fall below the previous peak (%, positive) of the strategy at the same points.
    drawdown_curve: list[float] = Field(default_factory=list)
    # Orders as a fraction (0-1) of the run, at most `MAX_MARKS` of them.
    marks: list[OrderMark] = Field(default_factory=list)


class PricePoint(CamelModel):
    time: datetime
    close: float


class WindowItem(CamelModel):
    """Inclusive days of one window; `summary` is None (and `error` set) when it had no candles."""

    start: date
    end: date
    summary: RunSummary | None = None
    error: Literal["no-candles"] | None = None


class WindowsResult(CamelModel):
    kind: Literal["windows"]
    length_days: int
    step_days: int
    items: list[WindowItem]
    # The asset's close over the whole range, to draw the windows against.
    prices: list[PricePoint]


class SensitivityAxis(CamelModel):
    id: str
    kind: str
    field: str
    rule_index: int
    condition_index: int
    base: float
    # One value per level (by default -20 %, -10 %, 0, +10 %, +20 %), integers rounded.
    values: list[float]
    levels: list[float]


class SensitivityCell(CamelModel):
    # Position on each axis (index into `values`); the last axis varies fastest in the list.
    coords: list[int]
    values: list[float]
    summary: RunSummary | None = None
    # "invalid": the variant breaks the condition's rules; "conflict": its rules contradict.
    error: Literal["invalid", "conflict", "no-candles"] | None = None


class SensitivityResult(CamelModel):
    kind: Literal["sensitivity"]
    axes: list[SensitivityAxis]
    cells: list[SensitivityCell]


class TimeframeItem(CamelModel):
    timeframe: Timeframe
    summary: RunSummary | None = None
    error: Literal["no-candles"] | None = None
    # First candle simulated; later than the requested start when the history begins later.
    starts_at: datetime | None = None


class TimeframesResult(CamelModel):
    kind: Literal["timeframes"]
    items: list[TimeframeItem]


class McBands(CamelModel):
    """Percentiles, point by point, of the equity (normalized to 100) of the paths."""

    p5: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p95: list[float]


class McCheckpoint(CamelModel):
    """The bands once the first `runs` paths are in (the animation settles through these)."""

    runs: int
    bands: McBands


class McReal(CamelModel):
    """The strategy on the real candles, to place it among the synthetic paths."""

    return_pct: float
    benchmark_return_pct: float
    max_drawdown_pct: float
    curve: list[float]


class McPathsResult(CamelModel):
    kind: Literal["mc-paths"]
    runs: int
    block_length: int
    seed: int
    candle_count: int
    real: McReal
    # A few whole paths (evenly spaced in the order they were drawn), same points as the bands.
    samples: list[list[float]]
    bands: McBands
    checkpoints: list[McCheckpoint]
    # Final return and deepest drawdown (%) of every path, in the order they were drawn.
    returns: list[float]
    drawdowns: list[float]
    # Share (%) of the paths that beat buying and holding on their own candles.
    beat_hold_pct: float


BatchResult = Annotated[
    AssetsBatchResult | WindowsResult | SensitivityResult | TimeframesResult | McPathsResult,
    Field(discriminator="kind"),
]
