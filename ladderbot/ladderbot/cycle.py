"""CycleGovernor: hard 12-trade-per-cycle policy layer.

Ms. Juanita's rule: never take a 13th trade. Cycle completes at 12,
requires an explicit human unlock (or a persisted reset) to start the
next cycle. Also carries the compounding ledger and a drawdown
kill-switch.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


CYCLE_MAX_TRADES = 12


@dataclass
class CycleState:
    starting_capital: float
    current_capital: float
    per_option_target_dollars: float
    trade_count: int = 0
    realized_pnl: float = 0.0
    peak_capital: float = 0.0
    trades: List[dict] = field(default_factory=list)
    started_at: datetime = field(default_factory=datetime.now)
    locked: bool = False
    lock_reason: Optional[str] = None

    def drawdown(self) -> float:
        if self.peak_capital <= 0:
            return 0.0
        return (self.peak_capital - self.current_capital) / self.peak_capital


class CycleGovernor:
    def __init__(
        self,
        starting_capital: float,
        per_option_target_dollars: float = 225.0,
        max_drawdown_pct: float = 0.20,
    ):
        if starting_capital <= 0:
            raise ValueError("starting_capital must be positive")
        self.max_drawdown_pct = max_drawdown_pct
        self.state = CycleState(
            starting_capital=starting_capital,
            current_capital=starting_capital,
            per_option_target_dollars=per_option_target_dollars,
            peak_capital=starting_capital,
        )

    def can_open_trade(self) -> tuple[bool, str]:
        s = self.state
        if s.locked:
            return False, f"cycle locked: {s.lock_reason}"
        if s.trade_count >= CYCLE_MAX_TRADES:
            return False, f"cycle complete ({CYCLE_MAX_TRADES}/{CYCLE_MAX_TRADES}) — no 13th trade"
        if s.drawdown() >= self.max_drawdown_pct:
            self.lock(f"drawdown {s.drawdown():.1%} >= {self.max_drawdown_pct:.0%}")
            return False, s.lock_reason or "drawdown kill-switch"
        return True, "ok"

    def record_trade(self, pnl_dollars: float, meta: Optional[dict] = None) -> None:
        s = self.state
        ok, reason = self.can_open_trade()
        if not ok:
            raise RuntimeError(f"cycle rejected trade: {reason}")
        s.trade_count += 1
        s.realized_pnl += pnl_dollars
        s.current_capital += pnl_dollars
        s.peak_capital = max(s.peak_capital, s.current_capital)
        s.trades.append({
            "n": s.trade_count,
            "pnl": pnl_dollars,
            "capital_after": s.current_capital,
            "at": datetime.now().isoformat(),
            **(meta or {}),
        })

    def lock(self, reason: str) -> None:
        self.state.locked = True
        self.state.lock_reason = reason

    def unlock_new_cycle(self, new_starting_capital: Optional[float] = None) -> CycleState:
        """Human-authorized start of the next 12-trade cycle.

        Rolls current_capital forward (or takes an explicit override) and
        resets counters. Returns the fresh state.
        """
        cap = new_starting_capital if new_starting_capital is not None else self.state.current_capital
        self.state = CycleState(
            starting_capital=cap,
            current_capital=cap,
            per_option_target_dollars=self.state.per_option_target_dollars,
            peak_capital=cap,
        )
        return self.state

    def size_contracts(self, premium_dollars_per_contract: float, capital_utilization: float = 0.84) -> int:
        """Contracts count matching the ~84% capital deployment pattern
        from the transcript ($16,800 of $20,000)."""
        if premium_dollars_per_contract <= 0:
            return 0
        budget = self.state.current_capital * capital_utilization
        return max(0, int(budget // premium_dollars_per_contract))
