"""PersistentGovernor: CycleGovernor wrapper that mirrors every mutation
to disk via CycleRepository.

Usage:
    gov = PersistentGovernor(cycle_id=1, repo=CycleRepository(), inner=CycleGovernor(...))
Any subsequent record_trade/lock/unlock call writes through.
"""

from typing import Optional

from ladderbot.cycle import CycleGovernor, CycleState

from .cycle_repo import CycleRepository


class PersistentGovernor:
    """Behaves like a CycleGovernor but persists state on every mutation."""

    def __init__(self, cycle_id: int, repo: CycleRepository, inner: CycleGovernor):
        self.cycle_id = cycle_id
        self.repo = repo
        self.inner = inner

    # ---- delegated read API ---------------------------------------------

    @property
    def state(self) -> CycleState:
        return self.inner.state

    @state.setter
    def state(self, value: CycleState) -> None:
        self.inner.state = value

    def can_open_trade(self):
        return self.inner.can_open_trade()

    def size_contracts(self, premium_dollars_per_contract: float,
                       capital_utilization: float = 0.84) -> int:
        return self.inner.size_contracts(premium_dollars_per_contract, capital_utilization)

    # ---- mutating API (persists to disk) --------------------------------

    def record_trade(self, pnl_dollars: float, meta: Optional[dict] = None) -> None:
        pre_count = self.inner.state.trade_count
        self.inner.record_trade(pnl_dollars=pnl_dollars, meta=meta)
        latest = self.inner.state.trades[-1] if self.inner.state.trades else None
        if latest is not None and latest["n"] == pre_count + 1:
            self.repo.append_trade(self.cycle_id, latest)
        self.repo.update_state(self.cycle_id, self.inner.state)

    def lock(self, reason: str) -> None:
        self.inner.lock(reason)
        self.repo.update_state(self.cycle_id, self.inner.state)

    def unlock_new_cycle(self, new_starting_capital: Optional[float] = None) -> CycleState:
        """Close the current DB cycle and open a new one."""
        self.repo.close(self.cycle_id)
        new_state = self.inner.unlock_new_cycle(new_starting_capital)
        self.cycle_id = self.repo.create(new_state)
        return new_state


def open_or_resume(
    repo: CycleRepository,
    starting_capital: float,
    per_option_target_dollars: float = 225.0,
    max_drawdown_pct: float = 0.20,
) -> PersistentGovernor:
    """Restore the most recent active cycle from the DB or create a new one."""
    existing = repo.find_active()
    if existing is not None:
        inner = CycleGovernor(
            starting_capital=existing.state.starting_capital,
            per_option_target_dollars=existing.state.per_option_target_dollars,
            max_drawdown_pct=max_drawdown_pct,
        )
        inner.state = existing.state
        return PersistentGovernor(cycle_id=existing.id, repo=repo, inner=inner)

    inner = CycleGovernor(
        starting_capital=starting_capital,
        per_option_target_dollars=per_option_target_dollars,
        max_drawdown_pct=max_drawdown_pct,
    )
    cycle_id = repo.create(inner.state)
    return PersistentGovernor(cycle_id=cycle_id, repo=repo, inner=inner)
