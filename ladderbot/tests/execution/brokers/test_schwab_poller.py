"""Tests for the Schwab order-status poller."""

from datetime import date, timedelta

import pytest

from ladderbot.execution.brokers import (
    PollResult, SchwabBroker, SchwabConfig, SchwabOrderPoller,
)
from ladderbot.execution.brokers.http import HttpResponse
from ladderbot.execution.order import (
    LadderOrder, OrderRequest, OrderSide, OrderStatus,
)


class FakeTransport:
    def __init__(self):
        self.calls = []
        self._script = {}

    def script(self, method, url_contains, response):
        self._script[(method, url_contains)] = response

    def request(self, method, url, *, params=None, json=None,
                headers=None, timeout=10.0):
        self.calls.append({"method": method, "url": url})
        for (m, needle), resp in self._script.items():
            if m == method and needle in url:
                if isinstance(resp, Exception):
                    raise resp
                return resp
        return HttpResponse(status=404, body={"error": "no handler"})


def _req():
    return OrderRequest(
        symbol="CL", option_type="call", strike=82.5,
        expiration=date.today() + timedelta(days=45),
        side=OrderSide.BUY_TO_OPEN, contracts=5,
        client_order_id="test-abc",
    )


def _open_order(order_id="OID-1", contracts=5):
    req = _req()
    req.contracts = contracts
    o = LadderOrder(request=req, status=OrderStatus.SUBMITTED, order_id=order_id)
    return o


def _cfg():
    return SchwabConfig(account_hash="acct-1", access_token="tok")


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------

def test_poll_promotes_working_to_filled_and_applies_fills():
    tx = FakeTransport()
    tx.script("GET", "/orders/OID-1", HttpResponse(status=200, body={
        "orderId": "OID-1", "status": "FILLED",
        "filledQuantity": 5, "remainingQuantity": 0,
        "orderActivityCollection": [{
            "executionLegs": [
                {"legId": 1, "quantity": 3, "price": 2.35},
                {"legId": 1, "quantity": 2, "price": 2.40},
            ],
        }],
    }))
    order = _open_order()
    orders = {order.order_id: order}
    poller = SchwabOrderPoller(config=_cfg(), orders_by_id=orders, transport=tx)

    r = poller.poll("OID-1")
    assert r.changed
    assert order.status == OrderStatus.FILLED
    assert order.filled_contracts == 5
    assert order.avg_fill_price_points == pytest.approx((3*2.35 + 2*2.40)/5)
    assert r.new_fill is not None
    assert r.new_fill.contracts == 5


def test_poll_partial_fill_then_final_fill_applies_only_delta():
    tx = FakeTransport()
    order = _open_order(contracts=10)
    orders = {order.order_id: order}
    poller = SchwabOrderPoller(config=_cfg(), orders_by_id=orders, transport=tx)

    # First poll: 4 of 10 filled at $2.30
    tx.script("GET", "/orders/OID-1", HttpResponse(status=200, body={
        "status": "WORKING", "filledQuantity": 4, "remainingQuantity": 6,
        "orderActivityCollection": [{
            "executionLegs": [{"quantity": 4, "price": 2.30}],
        }],
    }))
    poller.poll("OID-1")
    assert order.status == OrderStatus.PARTIALLY_FILLED
    assert order.filled_contracts == 4

    # Second poll: 10 of 10 filled — poller should apply only the 6 delta
    tx._script.clear()
    tx.script("GET", "/orders/OID-1", HttpResponse(status=200, body={
        "status": "FILLED", "filledQuantity": 10, "remainingQuantity": 0,
        "orderActivityCollection": [{
            "executionLegs": [{"quantity": 10, "price": 2.34}],
        }],
    }))
    poller.poll("OID-1")
    assert order.status == OrderStatus.FILLED
    assert order.filled_contracts == 10
    # Two fills booked: one 4-contract and one 6-contract delta
    assert len(order.fills) == 2
    assert [f.contracts for f in order.fills] == [4, 6]


def test_poll_no_change_is_idempotent():
    tx = FakeTransport()
    tx.script("GET", "/orders/OID-1", HttpResponse(status=200, body={
        "status": "WORKING", "filledQuantity": 0, "remainingQuantity": 5,
    }))
    order = _open_order()
    orders = {order.order_id: order}
    poller = SchwabOrderPoller(config=_cfg(), orders_by_id=orders, transport=tx)
    r1 = poller.poll("OID-1")
    r2 = poller.poll("OID-1")
    assert r1.changed is False and r2.changed is False
    assert order.status == OrderStatus.SUBMITTED
    assert order.filled_contracts == 0


# ---------------------------------------------------------------------------
# terminal states
# ---------------------------------------------------------------------------

def test_poll_maps_canceled_and_expired():
    for schwab_status, expected in [("CANCELED", OrderStatus.CANCELED),
                                    ("EXPIRED",  OrderStatus.CANCELED)]:
        tx = FakeTransport()
        tx.script("GET", "/orders/OID-1", HttpResponse(status=200, body={
            "status": schwab_status, "filledQuantity": 0,
        }))
        order = _open_order()
        poller = SchwabOrderPoller(config=_cfg(),
                                   orders_by_id={"OID-1": order}, transport=tx)
        r = poller.poll("OID-1")
        assert r.changed
        assert order.status == expected
        assert order.completed_at is not None
        if schwab_status == "EXPIRED":
            assert "expired" in (order.reject_reason or "").lower()


def test_poll_maps_rejected_and_captures_reason():
    tx = FakeTransport()
    tx.script("GET", "/orders/OID-1", HttpResponse(status=200, body={
        "status": "REJECTED", "statusDescription": "insufficient BP",
    }))
    order = _open_order()
    poller = SchwabOrderPoller(config=_cfg(),
                               orders_by_id={"OID-1": order}, transport=tx)
    poller.poll("OID-1")
    assert order.status == OrderStatus.REJECTED
    assert order.reject_reason == "insufficient BP"


def test_poll_skips_terminal_orders():
    tx = FakeTransport()  # no scripted response — a call would 404
    order = _open_order()
    order.status = OrderStatus.FILLED
    poller = SchwabOrderPoller(config=_cfg(),
                               orders_by_id={"OID-1": order}, transport=tx)
    r = poller.poll("OID-1")
    assert r.changed is False
    assert tx.calls == []


# ---------------------------------------------------------------------------
# errors + edge cases
# ---------------------------------------------------------------------------

def test_poll_http_error_records_reason_without_raising():
    tx = FakeTransport()
    tx.script("GET", "/orders/OID-1",
              HttpResponse(status=500, body={"error": "internal"}))
    order = _open_order()
    poller = SchwabOrderPoller(config=_cfg(),
                               orders_by_id={"OID-1": order}, transport=tx)
    r = poller.poll("OID-1")
    assert r.error and "500" in r.error
    assert order.status == OrderStatus.SUBMITTED  # unchanged


def test_poll_transport_exception_is_swallowed():
    tx = FakeTransport()
    tx.script("GET", "/orders/OID-1", ConnectionError("dns"))
    order = _open_order()
    poller = SchwabOrderPoller(config=_cfg(),
                               orders_by_id={"OID-1": order}, transport=tx)
    r = poller.poll("OID-1")
    assert r.error and "ConnectionError" in r.error


def test_poll_once_fans_out_over_all_open_orders():
    tx = FakeTransport()
    for oid in ("OID-1", "OID-2"):
        tx.script("GET", f"/orders/{oid}", HttpResponse(status=200, body={
            "status": "FILLED", "filledQuantity": 5,
            "orderActivityCollection": [{
                "executionLegs": [{"quantity": 5, "price": 2.35}],
            }],
        }))
    orders = {
        "OID-1": _open_order("OID-1"),
        "OID-2": _open_order("OID-2"),
        "OID-3": _open_order("OID-3"),
    }
    orders["OID-3"].status = OrderStatus.CANCELED  # skipped
    poller = SchwabOrderPoller(config=_cfg(), orders_by_id=orders, transport=tx)
    results = poller.poll_once()
    assert len(results) == 2
    assert all(r.changed for r in results)


def test_poller_falls_back_to_filledPrice_when_no_legs():
    tx = FakeTransport()
    tx.script("GET", "/orders/OID-1", HttpResponse(status=200, body={
        "status": "FILLED", "filledQuantity": 5, "filledPrice": 2.50,
        "orderActivityCollection": [],
    }))
    order = _open_order()
    poller = SchwabOrderPoller(config=_cfg(),
                               orders_by_id={"OID-1": order}, transport=tx)
    poller.poll("OID-1")
    assert order.status == OrderStatus.FILLED
    assert order.avg_fill_price_points == pytest.approx(2.50)


def test_poll_unknown_order_raises():
    poller = SchwabOrderPoller(config=_cfg(), orders_by_id={},
                               transport=FakeTransport())
    with pytest.raises(KeyError):
        poller.poll("bogus")


# ---------------------------------------------------------------------------
# broker convenience
# ---------------------------------------------------------------------------

def test_broker_poll_open_orders_uses_broker_state():
    tx = FakeTransport()
    tx.script("POST", "/orders", HttpResponse(
        status=201, body={}, headers={"Location": "/orders/OID-A"}))
    tx.script("GET", "/orders/OID-A", HttpResponse(status=200, body={
        "status": "FILLED", "filledQuantity": 5,
        "orderActivityCollection": [{
            "executionLegs": [{"quantity": 5, "price": 2.42}],
        }],
    }))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    order = broker.submit(_req())
    assert order.order_id == "OID-A"

    results = broker.poll_open_orders()
    assert len(results) == 1
    assert results[0].changed
    assert order.status == OrderStatus.FILLED
    assert order.filled_contracts == 5
    # Broker's poller cache is reused
    assert broker.poller is broker.poller
