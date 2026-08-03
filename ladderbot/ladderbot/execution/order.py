"""Order / Fill / Status data types for the LadderBot execution layer.

Intentionally minimal — the LadderStrategy only needs option orders
with a fixed dollar profit target and no stop (per the transcript's
plan-and-exit rule).
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import List, Optional
from uuid import uuid4


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"


class OrderSide(str, Enum):
    BUY_TO_OPEN = "BUY_TO_OPEN"
    SELL_TO_CLOSE = "SELL_TO_CLOSE"


@dataclass
class OrderRequest:
    """Instruction handed to a broker."""
    symbol: str                    # underlying futures symbol (CL, NQ, ...)
    option_type: str               # "call" | "put"
    strike: float
    expiration: date
    side: OrderSide
    contracts: int
    limit_price: Optional[float] = None    # in premium points; None = market
    ladder_score: Optional[float] = None
    cycle_trade_number: Optional[int] = None
    client_order_id: str = field(default_factory=lambda: uuid4().hex[:12])


@dataclass
class Fill:
    fill_id: str
    order_id: str
    price_points: float
    contracts: int
    at: datetime = field(default_factory=datetime.now)


@dataclass
class LadderOrder:
    """Broker-side order record."""
    request: OrderRequest
    order_id: str = field(default_factory=lambda: uuid4().hex[:16])
    status: OrderStatus = OrderStatus.PENDING
    fills: List[Fill] = field(default_factory=list)
    submitted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    reject_reason: Optional[str] = None

    @property
    def filled_contracts(self) -> int:
        return sum(f.contracts for f in self.fills)

    @property
    def avg_fill_price_points(self) -> Optional[float]:
        if not self.fills:
            return None
        total = sum(f.price_points * f.contracts for f in self.fills)
        return total / self.filled_contracts

    def add_fill(self, price_points: float, contracts: int) -> Fill:
        fill = Fill(fill_id=uuid4().hex[:12], order_id=self.order_id,
                    price_points=price_points, contracts=contracts)
        self.fills.append(fill)
        if self.filled_contracts >= self.request.contracts:
            self.status = OrderStatus.FILLED
            self.completed_at = datetime.now()
        else:
            self.status = OrderStatus.PARTIALLY_FILLED
        return fill
