"""Dashboard snapshot: read-only status view of the bot.

Returns a plain dict that any HTTP layer can serialize as JSON. Kept
framework-free so it can be dropped into Flask/FastAPI/Starlette by
the caller without dragging web deps into this package.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from ladderbot.persistence.cycle_repo import CycleRepository
from ladderbot.persistence.slip_repo import TraceSlipRepository

from .limits import TradingGuard


@dataclass
class DashboardSnapshot:
    cycle: Optional[Dict[str, Any]]
    recent_slips: List[Dict[str, Any]] = field(default_factory=list)
    guard: Optional[Dict[str, Any]] = None
    at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cycle": self.cycle,
            "recent_slips": self.recent_slips,
            "guard": self.guard,
            "at": self.at,
        }


def dashboard_snapshot(
    cycle_repo: CycleRepository,
    slip_repo: TraceSlipRepository,
    guard: Optional[TradingGuard] = None,
    recent_limit: int = 10,
) -> DashboardSnapshot:
    active = cycle_repo.find_active()
    cycle_view: Optional[Dict[str, Any]] = None
    slips: List[Dict[str, Any]] = []

    if active is not None:
        s = active.state
        cycle_view = {
            "cycle_id": active.id,
            "starting_capital": s.starting_capital,
            "current_capital": s.current_capital,
            "peak_capital": s.peak_capital,
            "drawdown_pct": (s.peak_capital - s.current_capital) / s.peak_capital
                             if s.peak_capital else 0.0,
            "trade_count": s.trade_count,
            "trades_remaining": max(0, 12 - s.trade_count),
            "realized_pnl": s.realized_pnl,
            "per_option_target_dollars": s.per_option_target_dollars,
            "locked": s.locked,
            "lock_reason": s.lock_reason,
            "started_at": s.started_at.isoformat(),
        }
        all_slips = slip_repo.list_for_cycle(active.id)
        slips = all_slips[-recent_limit:]

    return DashboardSnapshot(
        cycle=cycle_view,
        recent_slips=slips,
        guard=guard.snapshot() if guard is not None else None,
    )
