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


class ReplayCandle(CamelModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float


class Trade(CamelModel):
    time: datetime
    # Index in `BacktestResult.candles` (display buckets).
    index: int
    side: Literal["buy", "sell"]
    price: float
    quantity: float
    # USDT spent (buy, fee included) or received (sell, fee deducted).
    amount: float
    # Realized PnL of a sell.
    pnl: float | None = None
    # `Rule.id` of the rule that placed the order.
    rule_id: str


class BacktestStats(CamelModel):
    buys: int
    sells: int
    trades: int
    realized_pnl: float
    unrealized_pnl: float
    return_pct: float
    win_rate_pct: float
    max_drawdown_pct: float
    sharpe: float
    final_capital: float
    open_position: bool


class BacktestResult(CamelModel):
    # Real number of candles simulated; `candles` is downsampled to at most MAX_DISPLAY_CANDLES.
    candle_count: int
    candles: list[ReplayCandle]
    trades: list[Trade]
    # Per display candle, cumulative up to and including it.
    buys: list[int]
    sells: list[int]
    realized: list[float]
    equity: list[float]
    # Short equity curve normalized to 100, for list sparklines.
    equity_curve: list[float]
    stats: BacktestStats
