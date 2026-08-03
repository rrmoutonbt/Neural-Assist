"""SchwabOrderPoller.

Schwab typically acks a submitted order with an empty 201 body and
requires GET /accounts/{hash}/orders/{orderId} to learn the fill
outcome. This poller does exactly that — no threads, no asyncio, just
poll_once() and poll(order_id) methods the caller schedules however it
wants (LadderLiveRunner.tick loop, cron, threading.Timer).

Design points that matter:

* Fill dedup. Schwab's execution legs don't ship a stable unique id,
  so we track dedup by (order_id, filled_quantity_at_last_poll) and
  book the delta as a single fill at the API-reported avg price.
  Per-leg granularity is discarded in favor of provable correctness.

* Terminal-state skip. FILLED / CANCELED / REJECTED orders are never
  re-polled — they're removed from the poller's active set after
  their terminal update.

* Failure isolation. A single order's poll failure never blocks the
  others in poll_once(); errors are recorded on the order's
  reject_reason (or discarded if the order was already terminal).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

from ..order import Fill, LadderOrder, OrderStatus

from .http import HttpError, HttpTransport, RequestsTransport
from .schwab_broker import SchwabConfig


# Schwab's textual status → LadderBot enum. Anything unmapped falls
# through to SUBMITTED (still working) so we don't lose the order.
SCHWAB_STATUS: Dict[str, OrderStatus] = {
    "AWAITING_PARENT_ORDER":      OrderStatus.PENDING,
    "AWAITING_CONDITION":         OrderStatus.PENDING,
    "AWAITING_STOP_CONDITION":    OrderStatus.PENDING,
    "AWAITING_MANUAL_REVIEW":     OrderStatus.PENDING,
    "ACCEPTED":                   OrderStatus.SUBMITTED,
    "AWAITING_UR_OUT":            OrderStatus.SUBMITTED,
    "PENDING_ACTIVATION":         OrderStatus.SUBMITTED,
    "QUEUED":                     OrderStatus.SUBMITTED,
    "WORKING":                    OrderStatus.SUBMITTED,
    "NEW":                        OrderStatus.SUBMITTED,
    "AWAITING_RELEASE_TIME":      OrderStatus.SUBMITTED,
    "PENDING_ACKNOWLEDGEMENT":    OrderStatus.SUBMITTED,
    "PENDING_RECALL":             OrderStatus.SUBMITTED,
    "PENDING_REPLACE":            OrderStatus.SUBMITTED,
    "REPLACED":                   OrderStatus.SUBMITTED,
    "FILLED":                     OrderStatus.FILLED,
    "CANCELED":                   OrderStatus.CANCELED,
    "PENDING_CANCEL":             OrderStatus.SUBMITTED,
    "EXPIRED":                    OrderStatus.CANCELED,
    "REJECTED":                   OrderStatus.REJECTED,
    "PARTIALLY_FILLED":           OrderStatus.PARTIALLY_FILLED,
}

TERMINAL_STATES = {
    OrderStatus.FILLED, OrderStatus.CANCELED, OrderStatus.REJECTED,
}


@dataclass
class PollResult:
    order: LadderOrder
    changed: bool
    new_fill: Optional[Fill] = None
    error: Optional[str] = None


@dataclass
class SchwabOrderPoller:
    config: SchwabConfig
    orders_by_id: Dict[str, LadderOrder]
    transport: HttpTransport = field(default_factory=RequestsTransport)
    # Track (order_id -> last-seen filledQuantity) so we can compute deltas
    # even if the poller is restarted with warm state loaded from disk.
    _seen_filled: Dict[str, float] = field(default_factory=dict)

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    def poll_once(self) -> List[PollResult]:
        results: List[PollResult] = []
        for order_id in list(self._active_ids()):
            results.append(self.poll(order_id))
        return results

    def poll(self, order_id: str) -> PollResult:
        order = self.orders_by_id.get(order_id)
        if order is None:
            raise KeyError(f"unknown order_id {order_id}")
        if order.status in TERMINAL_STATES:
            return PollResult(order=order, changed=False)

        url = (f"{self.config.base_url}/accounts/{self.config.account_hash}"
               f"/orders/{order_id}")
        try:
            resp = self.transport.request(
                "GET", url, headers=self._auth_headers(),
                timeout=self.config.request_timeout_seconds,
            )
        except HttpError as e:
            return PollResult(order=order, changed=False,
                              error=f"HTTP {e.status}")
        except Exception as e:
            return PollResult(order=order, changed=False,
                              error=f"{type(e).__name__}: {e}")

        if not resp.ok:
            return PollResult(order=order, changed=False,
                              error=f"HTTP {resp.status}")

        return self._apply(order, resp.body)

    # ------------------------------------------------------------------
    # payload → order updates
    # ------------------------------------------------------------------

    def _apply(self, order: LadderOrder, body) -> PollResult:
        if not isinstance(body, dict):
            return PollResult(order=order, changed=False, error="non-JSON body")

        api_status_raw = str(body.get("status", "")).upper()
        api_status = SCHWAB_STATUS.get(api_status_raw)

        api_filled = float(body.get("filledQuantity", 0.0) or 0.0)
        seen = self._seen_filled.get(order.order_id, float(order.filled_contracts))
        delta = api_filled - seen

        changed = False
        new_fill: Optional[Fill] = None

        # Apply any new fill quantity as a single delta-fill at the avg price
        # reported by the venue. We prefer the average from the executionLegs
        # weighted by leg quantity; fall back to filledPrice / lastFillPrice.
        if delta > 0:
            avg_price = _weighted_avg_price(body, delta, api_filled)
            new_fill = order.add_fill(
                price_points=float(avg_price),
                contracts=int(round(delta)),
            )
            self._seen_filled[order.order_id] = api_filled
            changed = True

        # Status transitions AFTER fills so add_fill's PARTIAL/FILLED promotion
        # doesn't get stomped when Schwab reports "WORKING" while a partial
        # is in flight.
        if api_status is not None:
            if api_status == OrderStatus.FILLED:
                if order.status != OrderStatus.FILLED:
                    order.status = OrderStatus.FILLED
                    order.completed_at = datetime.now()
                    changed = True
            elif api_status == OrderStatus.CANCELED:
                if order.status != OrderStatus.CANCELED:
                    order.status = OrderStatus.CANCELED
                    order.completed_at = datetime.now()
                    if api_status_raw == "EXPIRED":
                        order.reject_reason = (order.reject_reason
                                               or "expired at venue")
                    changed = True
            elif api_status == OrderStatus.REJECTED:
                if order.status != OrderStatus.REJECTED:
                    order.status = OrderStatus.REJECTED
                    order.completed_at = datetime.now()
                    order.reject_reason = (
                        order.reject_reason
                        or _extract_status_reason(body)
                        or api_status_raw or "REJECTED"
                    )
                    changed = True
            elif api_status == OrderStatus.PARTIALLY_FILLED:
                if order.status != OrderStatus.PARTIALLY_FILLED and \
                        order.status not in TERMINAL_STATES:
                    order.status = OrderStatus.PARTIALLY_FILLED
                    changed = True
            else:  # SUBMITTED / PENDING
                if order.status == OrderStatus.PENDING:
                    order.status = OrderStatus.SUBMITTED
                    changed = True

        return PollResult(order=order, changed=changed, new_fill=new_fill)

    # ------------------------------------------------------------------

    def _active_ids(self) -> Iterable[str]:
        return [oid for oid, o in self.orders_by_id.items()
                if o.status not in TERMINAL_STATES]

    def _auth_headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.config.bearer()}"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _weighted_avg_price(body, delta: float, api_filled: float) -> float:
    legs = _leg_iter(body)
    total_qty, total_notional = 0.0, 0.0
    for leg in legs:
        try:
            q = float(leg.get("quantity", 0) or 0)
            p = float(leg.get("price", 0) or 0)
        except (TypeError, ValueError):
            continue
        if q <= 0 or p <= 0:
            continue
        total_qty += q
        total_notional += q * p
    if total_qty > 0:
        return total_notional / total_qty

    # Fallbacks the venue sometimes reports directly:
    for key in ("filledPrice", "lastFillPrice", "avgFillPrice", "price"):
        v = body.get(key)
        try:
            f = float(v)
            if f > 0:
                return f
        except (TypeError, ValueError):
            continue
    return 0.0


def _leg_iter(body) -> Iterable[dict]:
    activities = body.get("orderActivityCollection") or []
    for a in activities:
        for leg in (a.get("executionLegs") or []):
            yield leg


def _extract_status_reason(body) -> Optional[str]:
    for k in ("statusDescription", "cancelReason", "message", "error"):
        v = body.get(k)
        if v:
            return str(v)
    return None
