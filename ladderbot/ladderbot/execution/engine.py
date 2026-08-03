"""LadderExecutionEngine: closes the loop from signal to booked P&L.

Given a TradingSignal from LadderStrategy:
  1. Resolves the target strike via the chain provider (delta-target).
  2. Builds a TraceSlip.
  3. Submits BUY_TO_OPEN through the broker.
  4. Watches the option mid; when premium delta * contracts * dpp >=
     dollar_target, submits SELL_TO_CLOSE.
  5. Records the round-trip into LadderStrategy.record_fill_and_close,
     which drives the CycleGovernor.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import List, Optional

from ladderbot._base import TradingSignal
from ladderbot.instruments import get as get_instrument
from ladderbot.strategy import LadderStrategy
from ladderbot.trace_slip import TraceSlip

from .broker import LadderBroker
from .chain_provider import OptionChainProvider, pick_strike_by_delta
from .order import LadderOrder, OrderRequest, OrderSide, OrderStatus


@dataclass
class TradeRoundTrip:
    slip: TraceSlip
    entry_order: LadderOrder
    exit_order: Optional[LadderOrder] = None
    realized_pnl: Optional[float] = None
    target_reached: bool = False
    reason_closed: str = ""


@dataclass
class LadderExecutionEngine:
    strategy: LadderStrategy
    broker: LadderBroker
    chain_provider: OptionChainProvider
    target_delta: float = 0.38
    default_dte: int = 45
    max_poll_ticks: int = 500
    history: List[TradeRoundTrip] = field(default_factory=list)

    def execute_signal(self, signal: TradingSignal) -> Optional[TradeRoundTrip]:
        m = signal.metadata or {}
        side = m.get("side", "CALL")
        option_type = "call" if side == "CALL" else "put"
        contracts = int(m.get("contracts", 0))
        if contracts <= 0:
            return None

        dte = int(m.get("days_to_expiration") or self.default_dte)
        chain = self.chain_provider.get_chain(signal.symbol, target_dte=dte)
        if chain is None:
            return None
        quote = pick_strike_by_delta(chain, target_delta=self.target_delta,
                                     option_type=option_type)
        if quote is None:
            return None

        # Build the trace slip from the strategy (already knows sizing/target).
        slip = self.strategy.build_trace_slip(signal)

        entry_req = OrderRequest(
            symbol=signal.symbol, option_type=option_type, strike=quote.strike,
            expiration=chain.expiration, side=OrderSide.BUY_TO_OPEN,
            contracts=contracts, ladder_score=m.get("ladder_score"),
            cycle_trade_number=m.get("cycle_trade_number"),
        )
        entry_order = self.broker.submit(entry_req)
        if entry_order.status not in (OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED):
            rt = TradeRoundTrip(slip=slip, entry_order=entry_order,
                                reason_closed="entry_rejected")
            self.history.append(rt)
            return rt

        rt = TradeRoundTrip(slip=slip, entry_order=entry_order)
        self.history.append(rt)
        return rt

    def try_close_at_target(self, rt: TradeRoundTrip) -> bool:
        """Check the current mid; if $ target reached, submit exit + book P&L.

        Returns True if the trade was closed on this call.
        """
        if rt.exit_order is not None:
            return False
        instrument = get_instrument(rt.entry_order.request.symbol)
        entry_px = rt.entry_order.avg_fill_price_points
        if entry_px is None:
            return False

        current_mid = self.broker.current_option_mid(rt.entry_order)
        if current_mid is None:
            return False

        contracts = rt.entry_order.filled_contracts
        unrealized_pts = current_mid - entry_px
        unrealized_dollars = unrealized_pts * instrument.dollars_per_point * contracts
        target_dollars = self.strategy.per_option_target * contracts

        if unrealized_dollars < target_dollars:
            return False

        exit_req = OrderRequest(
            symbol=rt.entry_order.request.symbol,
            option_type=rt.entry_order.request.option_type,
            strike=rt.entry_order.request.strike,
            expiration=rt.entry_order.request.expiration,
            side=OrderSide.SELL_TO_CLOSE, contracts=contracts,
            ladder_score=rt.entry_order.request.ladder_score,
            cycle_trade_number=rt.entry_order.request.cycle_trade_number,
        )
        exit_order = self.broker.submit(exit_req)
        rt.exit_order = exit_order
        exit_px = exit_order.avg_fill_price_points or current_mid

        rt.realized_pnl = self.strategy.record_fill_and_close(
            slip=rt.slip,
            entry_fill_points=entry_px,
            exit_fill_points=exit_px,
            entry_ticket_id=rt.entry_order.order_id,
            exit_ticket_id=exit_order.order_id,
        )
        rt.target_reached = True
        rt.reason_closed = "target_hit"
        return True

    def run_signal(self, signal: TradingSignal) -> Optional[TradeRoundTrip]:
        """Convenience: submit + close in one call (assumes broker mid moves).

        Real deployments call execute_signal, then poll try_close_at_target
        from an event loop or ticker callback. This method is here for
        backtests + tests that already know the exit chain snapshot.
        """
        rt = self.execute_signal(signal)
        if rt is None or rt.entry_order.status == OrderStatus.REJECTED:
            return rt
        for _ in range(self.max_poll_ticks):
            if self.try_close_at_target(rt):
                break
        return rt
