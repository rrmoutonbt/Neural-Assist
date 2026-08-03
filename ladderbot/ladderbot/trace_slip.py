"""TraceSlip: per-trade record mirroring Ms. Juanita's manual spreadsheet.

Auto-converts option premium points -> dollars via the instrument multiplier.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, date
from typing import Optional, Dict, Any

from ladderbot.instruments import Instrument, get as get_instrument


@dataclass
class TraceSlip:
    symbol: str
    side: str                       # "CALL" | "PUT"
    contracts: int
    entry_price_points: float       # premium paid in points
    target_price_points: float
    stop_price_points: Optional[float] = None
    delta: Optional[float] = None
    expiration: Optional[date] = None
    days_to_expiration: Optional[int] = None

    bid: Optional[float] = None
    ask: Optional[float] = None
    last: Optional[float] = None

    entry_ticket_id: Optional[str] = None
    entry_time: Optional[datetime] = None
    entry_fill_points: Optional[float] = None

    exit_ticket_id: Optional[str] = None
    exit_time: Optional[datetime] = None
    exit_fill_points: Optional[float] = None

    ladder_score: Optional[float] = None
    cycle_trade_number: Optional[int] = None
    notes: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def _instrument(self) -> Instrument:
        return get_instrument(self.symbol)

    @property
    def cost_dollars(self) -> float:
        pts = self.entry_fill_points if self.entry_fill_points is not None else self.entry_price_points
        return self._instrument().points_to_dollars(pts) * self.contracts

    @property
    def target_dollars(self) -> float:
        return self._instrument().points_to_dollars(self.target_price_points) * self.contracts

    @property
    def realized_pnl_dollars(self) -> Optional[float]:
        if self.exit_fill_points is None or self.entry_fill_points is None:
            return None
        pts = self.exit_fill_points - self.entry_fill_points
        sign = 1 if self.side == "CALL" else -1
        return sign * pts * self._instrument().dollars_per_point * self.contracts

    @property
    def realized_pnl_per_contract(self) -> Optional[float]:
        pnl = self.realized_pnl_dollars
        return pnl / self.contracts if pnl is not None and self.contracts else None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["cost_dollars"] = self.cost_dollars
        d["target_dollars"] = self.target_dollars
        d["realized_pnl_dollars"] = self.realized_pnl_dollars
        return d
