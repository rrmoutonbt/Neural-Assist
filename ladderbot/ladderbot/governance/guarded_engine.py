"""GuardedEngine: wraps PersistentEngine (or plain LadderExecutionEngine)
with a TradingGuard check + alert emission.

Order of ops on a signal:
  1. Consult TradingGuard.check_trade.
  2. If denied, emit an alert and return None (no order sent).
  3. If allowed, forward to the wrapped engine; on entry fill, record
     the open position with the guard.
  4. On close, record the pnl with the guard (which may trip cooldown /
     daily-loss and emit a follow-up alert).
"""

from __future__ import annotations

from typing import Optional, Union

from ladderbot._base import TradingSignal
from ladderbot.execution.engine import (
    LadderExecutionEngine, TradeRoundTrip,
)
from ladderbot.persistence.persistent_engine import PersistentEngine

from .alerts import AlertChannel, AlertSeverity, make_alert
from .limits import TradingGuard


class GuardedEngine:
    def __init__(
        self,
        inner: Union[LadderExecutionEngine, PersistentEngine],
        guard: TradingGuard,
        alerter: AlertChannel,
    ):
        self.inner = inner
        self.guard = guard
        self.alerter = alerter

    @property
    def _engine(self) -> LadderExecutionEngine:
        return self.inner.engine if isinstance(self.inner, PersistentEngine) else self.inner

    def execute_signal(self, signal: TradingSignal) -> Optional[TradeRoundTrip]:
        m = signal.metadata or {}
        contracts = int(m.get("contracts", 0))
        premium = float(m.get("premium_dollars", 0.0))
        current_capital = float(self._engine.strategy.governor.state.current_capital)

        decision = self.guard.check_trade(
            symbol=signal.symbol,
            contracts=contracts,
            premium_dollars_per_contract=premium,
            current_capital=current_capital,
        )
        if not decision.allowed:
            self.alerter.emit(make_alert(
                kind="trade_rejected",
                message=f"blocked {signal.symbol}: {decision.reason}",
                severity=AlertSeverity.WARNING,
                symbol=signal.symbol,
                triggered_rule=decision.triggered_rule,
                decision_metadata=decision.metadata,
            ))
            return None

        rt = self.inner.execute_signal(signal)
        if rt is None or rt.entry_order.status.value == "REJECTED":
            if rt is not None:
                self.alerter.emit(make_alert(
                    kind="broker_reject",
                    message=f"broker rejected entry for {signal.symbol}: "
                            f"{rt.entry_order.reject_reason}",
                    severity=AlertSeverity.ERROR,
                    symbol=signal.symbol,
                ))
            return rt

        self.guard.record_open(
            symbol=signal.symbol, side=m.get("side", "CALL"),
            contracts=contracts, notional_dollars=contracts * premium,
        )
        self.alerter.emit(make_alert(
            kind="trade_opened",
            message=f"opened {contracts}x {signal.symbol} {m.get('side', 'CALL')}",
            severity=AlertSeverity.INFO,
            symbol=signal.symbol, contracts=contracts,
            ladder_score=m.get("ladder_score"),
        ))
        return rt

    def try_close_at_target(self, rt: TradeRoundTrip) -> bool:
        pre_pnl = rt.realized_pnl
        closed = self.inner.try_close_at_target(rt)
        if closed and pre_pnl is None and rt.realized_pnl is not None:
            self.guard.record_close(symbol=rt.slip.symbol,
                                    pnl_dollars=float(rt.realized_pnl))
            self.alerter.emit(make_alert(
                kind="trade_closed",
                message=f"closed {rt.slip.symbol}: pnl={rt.realized_pnl:.2f}",
                severity=AlertSeverity.INFO,
                symbol=rt.slip.symbol,
                realized_pnl=rt.realized_pnl,
            ))
            gov_state = self._engine.strategy.governor.state
            if gov_state.locked:
                self.alerter.emit(make_alert(
                    kind="cycle_locked",
                    message=f"cycle locked: {gov_state.lock_reason}",
                    severity=AlertSeverity.CRITICAL,
                    lock_reason=gov_state.lock_reason,
                ))
        return closed

    def run_signal(self, signal: TradingSignal) -> Optional[TradeRoundTrip]:
        rt = self.execute_signal(signal)
        if rt is None or rt.entry_order.status.value == "REJECTED":
            return rt
        for _ in range(self._engine.max_poll_ticks):
            if self.try_close_at_target(rt):
                break
        return rt
