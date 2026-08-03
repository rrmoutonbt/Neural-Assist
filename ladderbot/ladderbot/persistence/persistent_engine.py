"""PersistentEngine: LadderExecutionEngine wrapper that writes every
trace slip + order + fill to disk. Wraps rather than subclasses to
keep engine internals decoupled from persistence.
"""

from typing import Optional

from ladderbot._base import TradingSignal
from ladderbot.execution.engine import (
    LadderExecutionEngine,
    TradeRoundTrip,
)

from .order_repo import OrderRepository
from .slip_repo import TraceSlipRepository


class PersistentEngine:
    def __init__(
        self,
        engine: LadderExecutionEngine,
        cycle_id: int,
        slip_repo: TraceSlipRepository,
        order_repo: OrderRepository,
    ):
        self.engine = engine
        self.cycle_id = cycle_id
        self.slip_repo = slip_repo
        self.order_repo = order_repo

    def execute_signal(self, signal: TradingSignal) -> Optional[TradeRoundTrip]:
        rt = self.engine.execute_signal(signal)
        if rt is None:
            return None
        slip_id = self.slip_repo.insert(self.cycle_id, rt.slip)
        self.order_repo.upsert_order(rt.entry_order, slip_id=slip_id)
        rt.slip.metadata = {**(rt.slip.metadata or {}), "slip_id": slip_id}
        return rt

    def try_close_at_target(self, rt: TradeRoundTrip) -> bool:
        pre_exit_id = rt.exit_order.order_id if rt.exit_order else None
        closed = self.engine.try_close_at_target(rt)
        if closed and rt.exit_order is not None and rt.exit_order.order_id != pre_exit_id:
            slip_id = (rt.slip.metadata or {}).get("slip_id")
            self.order_repo.upsert_order(rt.exit_order, slip_id=slip_id)
            if slip_id is not None:
                self.slip_repo.update_close(slip_id, rt.slip)
        return closed

    def run_signal(self, signal: TradingSignal) -> Optional[TradeRoundTrip]:
        rt = self.execute_signal(signal)
        if rt is None or rt.entry_order.status.value == "REJECTED":
            return rt
        for _ in range(self.engine.max_poll_ticks):
            if self.try_close_at_target(rt):
                break
        return rt
