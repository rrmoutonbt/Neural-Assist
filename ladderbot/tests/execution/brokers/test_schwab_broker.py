"""Tests for the Schwab (ThinkOrSwim ecosystem) broker adapter."""

from datetime import date, timedelta

import pytest

from ladderbot.execution.brokers import (
    OSIError, SchwabBroker, SchwabChainProvider, SchwabConfig,
    osi_symbol, parse_osi_symbol,
)
from ladderbot.execution.brokers.http import (
    HttpError, HttpResponse,
)
from ladderbot.execution.order import (
    OrderRequest, OrderSide, OrderStatus,
)


# ---------------------------------------------------------------------------
# OSI
# ---------------------------------------------------------------------------

def test_osi_encodes_futures_option():
    s = osi_symbol("CL", date(2024, 6, 21), "call", 82.5, is_future=True)
    assert len(s) == 21
    assert s == "/CL   240621C00082500"


def test_osi_encodes_equity_option():
    s = osi_symbol("SPY", date(2024, 6, 21), "call", 500.0)
    assert s == "SPY   240621C00500000"


def test_osi_round_trip():
    s = osi_symbol("NQ", date(2025, 1, 17), "put", 17250.5, is_future=True)
    parts = parse_osi_symbol(s)
    assert parts.root == "/NQ"
    assert parts.expiration == date(2025, 1, 17)
    assert parts.option_type == "put"
    assert parts.strike == pytest.approx(17250.5)


def test_osi_rejects_bad_type_and_long_root():
    with pytest.raises(OSIError):
        osi_symbol("CL", date(2024, 6, 21), "bogus", 82.5)
    with pytest.raises(OSIError):
        osi_symbol("TOOLONG", date(2024, 6, 21), "call", 1.0)


def test_osi_rejects_strike_out_of_range():
    with pytest.raises(OSIError):
        osi_symbol("SPY", date(2024, 6, 21), "call", 200000.0)


def test_parse_rejects_wrong_length():
    with pytest.raises(OSIError):
        parse_osi_symbol("too short")


# ---------------------------------------------------------------------------
# Fake transport
# ---------------------------------------------------------------------------

class FakeTransport:
    """Scripted transport — indexed by method+URL prefix."""

    def __init__(self):
        self.calls = []
        self._script = {}

    def script(self, method, url_contains, response):
        self._script[(method, url_contains)] = response

    def request(self, method, url, *, params=None, json=None,
                headers=None, timeout=10.0):
        self.calls.append({"method": method, "url": url, "params": params,
                           "json": json, "headers": headers or {}})
        for (m, needle), resp in self._script.items():
            if m == method and needle in url:
                if isinstance(resp, Exception):
                    raise resp
                return resp
        return HttpResponse(status=404, body={"error": f"no handler for {method} {url}"})


# ---------------------------------------------------------------------------
# SchwabBroker.submit
# ---------------------------------------------------------------------------

def _order_req(side=OrderSide.BUY_TO_OPEN, symbol="CL"):
    return OrderRequest(
        symbol=symbol, option_type="call", strike=82.5,
        expiration=date.today() + timedelta(days=45),
        side=side, contracts=5, client_order_id="test-abc",
    )


def _cfg():
    return SchwabConfig(account_hash="acct-hash-1", access_token="token-1")


def test_submit_success_captures_venue_order_id():
    tx = FakeTransport()
    tx.script("POST", "/orders", HttpResponse(
        status=201, body={},
        headers={"Location":
                 "https://api.schwabapi.com/trader/v1/accounts/acct-hash-1/orders/9876543210"},
    ))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    order = broker.submit(_order_req())
    assert order.status == OrderStatus.SUBMITTED
    assert order.order_id == "9876543210"
    assert order.reject_reason is None
    # Payload should have OSI + BUY_TO_OPEN
    body = tx.calls[-1]["json"]
    assert body["orderLegCollection"][0]["instruction"] == "BUY_TO_OPEN"
    assert body["orderLegCollection"][0]["instrument"]["symbol"].startswith("/CL")
    assert body["orderStrategyType"] == "SINGLE"
    assert body["clientOrderId"] == "test-abc"


def test_submit_rejected_by_venue_carries_message():
    tx = FakeTransport()
    tx.script("POST", "/orders", HttpResponse(
        status=400, body={"message": "insufficient buying power"},
    ))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    order = broker.submit(_order_req())
    assert order.status == OrderStatus.REJECTED
    assert "insufficient buying power" in (order.reject_reason or "")


def test_submit_transport_failure_marks_rejected_not_thrown():
    tx = FakeTransport()
    tx.script("POST", "/orders", ConnectionError("dns down"))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    order = broker.submit(_order_req())
    assert order.status == OrderStatus.REJECTED
    assert "ConnectionError" in (order.reject_reason or "")


def test_submit_limit_order_carries_price():
    tx = FakeTransport()
    tx.script("POST", "/orders", HttpResponse(
        status=201, body={}, headers={"Location": "/orders/1"}))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    req = _order_req()
    req.limit_price = 2.35
    broker.submit(req)
    body = tx.calls[-1]["json"]
    assert body["orderType"] == "LIMIT"
    assert body["price"] == 2.35


def test_submit_market_order_omits_price():
    tx = FakeTransport()
    tx.script("POST", "/orders", HttpResponse(
        status=201, body={}, headers={"Location": "/orders/1"}))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    broker.submit(_order_req())
    body = tx.calls[-1]["json"]
    assert body["orderType"] == "MARKET"
    assert "price" not in body


def test_submit_ack_with_inline_fills_populates_order():
    """Some brokers ack a marketable order with fills already attached."""
    tx = FakeTransport()
    tx.script("POST", "/orders", HttpResponse(
        status=201, body={
            "orderActivityCollection": [{
                "executionLegs": [{"price": 2.40, "quantity": 5}],
            }],
        },
        headers={"Location": "/orders/OID-1"},
    ))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    order = broker.submit(_order_req())
    assert order.status == OrderStatus.FILLED
    assert order.filled_contracts == 5
    assert order.avg_fill_price_points == pytest.approx(2.40)


# ---------------------------------------------------------------------------
# cancel
# ---------------------------------------------------------------------------

def test_cancel_updates_status_on_success():
    tx = FakeTransport()
    tx.script("POST", "/orders", HttpResponse(
        status=201, body={}, headers={"Location": "/orders/OID-9"}))
    tx.script("DELETE", "/orders/OID-9", HttpResponse(status=200, body={}))
    broker = SchwabBroker(config=_cfg(), transport=tx)
    order = broker.submit(_order_req())
    broker.cancel(order.order_id)
    assert order.status == OrderStatus.CANCELED
    assert order.completed_at is not None


def test_cancel_no_op_on_terminal_state():
    tx = FakeTransport()
    broker = SchwabBroker(config=_cfg(), transport=tx)
    # inject a manually filled order
    from ladderbot.execution.order import LadderOrder
    o = LadderOrder(request=_order_req(), status=OrderStatus.FILLED,
                    order_id="finalized")
    broker.orders_by_id[o.order_id] = o
    broker.cancel("finalized")
    assert o.status == OrderStatus.FILLED
    # No DELETE should have been issued
    assert not any(c["method"] == "DELETE" for c in tx.calls)


def test_cancel_unknown_order_raises():
    broker = SchwabBroker(config=_cfg(), transport=FakeTransport())
    with pytest.raises(KeyError):
        broker.cancel("does-not-exist")


# ---------------------------------------------------------------------------
# SchwabChainProvider
# ---------------------------------------------------------------------------

def test_chain_provider_parses_schwab_shape():
    tx = FakeTransport()
    tx.script("GET", "/chains", HttpResponse(status=200, body={
        "underlying": {"mark": 82.5},
        "callExpDateMap": {
            "2024-06-21:45": {
                "82.0": [{"bid": 3.10, "ask": 3.20, "last": 3.15,
                          "totalVolume": 120, "openInterest": 340,
                          "volatility": 32.5, "delta": 0.55}],
                "83.0": [{"bid": 2.40, "ask": 2.50,
                          "volatility": 30.0, "delta": 0.42}],
            },
        },
        "putExpDateMap": {
            "2024-06-21:45": {
                "82.0": [{"bid": 2.60, "ask": 2.70,
                          "volatility": 33.0, "delta": -0.45}],
            },
        },
    }))
    provider = SchwabChainProvider(config=_cfg(), transport=tx)
    chain = provider.get_chain(symbol="CL", target_dte=45)
    assert chain is not None
    assert chain.underlying_price == 82.5
    assert chain.days_to_expiration >= 1
    calls = [q for q in chain.quotes if q.option_type == "call"]
    puts  = [q for q in chain.quotes if q.option_type == "put"]
    assert len(calls) == 2
    assert len(puts) == 1
    # IV normalized from percent
    assert any(abs((q.iv or 0) - 0.325) < 1e-3 for q in calls)


def test_chain_provider_returns_none_on_missing_underlying():
    tx = FakeTransport()
    tx.script("GET", "/chains", HttpResponse(status=200, body={
        "callExpDateMap": {}, "putExpDateMap": {},
    }))
    provider = SchwabChainProvider(config=_cfg(), transport=tx)
    assert provider.get_chain(symbol="CL", target_dte=45) is None


def test_chain_provider_returns_none_on_http_error():
    tx = FakeTransport()
    tx.script("GET", "/chains", HttpResponse(status=401, body={"error": "unauth"}))
    provider = SchwabChainProvider(config=_cfg(), transport=tx)
    assert provider.get_chain(symbol="CL", target_dte=45) is None


# ---------------------------------------------------------------------------
# token / config
# ---------------------------------------------------------------------------

def test_token_provider_wins_over_static_token():
    cfg = SchwabConfig(account_hash="a", access_token="static",
                       token_provider=lambda: "fresh")
    assert cfg.bearer() == "fresh"


def test_bearer_missing_raises():
    cfg = SchwabConfig(account_hash="a")
    with pytest.raises(RuntimeError):
        cfg.bearer()
