"""Broker protocol + paper implementation.

PaperBroker fills against a live chain snapshot (bid for sells, ask for
buys) so the round-trip is realistic within bid/ask economics. It never
touches a real venue.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Callable, Dict, List, Optional, Protocol

from .chain_provider import ChainSnapshot, OptionChainProvider, pick_strike_by_delta
from .order import LadderOrder, OrderRequest, OrderSide, OrderStatus


class LadderBroker(Protocol):
    def submit(self, request: OrderRequest) -> LadderOrder: ...
    def cancel(self, order_id: str) -> LadderOrder: ...
    def current_option_mid(self, order: LadderOrder) -> Optional[float]: ...
    def orders(self) -> List[LadderOrder]: ...


@dataclass
class PaperBroker:
    """Paper broker fills against a supplied ChainSnapshot provider.

    - Buys fill at ask (with optional slippage).
    - Sell-to-close fills at bid.
    - Fully filled instantly (marketable). Slippage is configurable.
    """
    chain_provider: OptionChainProvider
    slippage_ticks: float = 0.0
    tick_size: float = 0.01
    orders_by_id: Dict[str, LadderOrder] = field(default_factory=dict)

    def _find_quote(self, req: OrderRequest):
        dte = max(1, (req.expiration - date.today()).days)
        chain = self.chain_provider.get_chain(req.symbol, target_dte=dte)
        if chain is None:
            return None, None
        for q in chain.quotes:
            if (q.option_type == req.option_type and
                abs(q.strike - req.strike) < self.tick_size):
                return chain, q
        return chain, None

    def submit(self, request: OrderRequest) -> LadderOrder:
        order = LadderOrder(request=request, status=OrderStatus.SUBMITTED,
                            submitted_at=datetime.now())
        self.orders_by_id[order.order_id] = order

        chain, quote = self._find_quote(request)
        if quote is None:
            order.status = OrderStatus.REJECTED
            order.reject_reason = f"no quote for {request.symbol} {request.option_type} K={request.strike}"
            order.completed_at = datetime.now()
            return order

        slip = self.slippage_ticks * self.tick_size
        if request.side == OrderSide.BUY_TO_OPEN:
            fill_px = quote.ask + slip
        else:
            fill_px = max(self.tick_size, quote.bid - slip)

        order.add_fill(price_points=float(fill_px), contracts=request.contracts)
        return order

    def cancel(self, order_id: str) -> LadderOrder:
        order = self.orders_by_id.get(order_id)
        if order is None:
            raise KeyError(f"unknown order_id {order_id}")
        if order.status in (OrderStatus.PENDING, OrderStatus.SUBMITTED):
            order.status = OrderStatus.CANCELED
            order.completed_at = datetime.now()
        return order

    def current_option_mid(self, order: LadderOrder) -> Optional[float]:
        _, quote = self._find_quote(order.request)
        return None if quote is None else float(quote.mid)

    def orders(self) -> List[LadderOrder]:
        return list(self.orders_by_id.values())
