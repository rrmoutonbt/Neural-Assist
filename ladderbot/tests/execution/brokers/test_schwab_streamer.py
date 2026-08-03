"""Tests for SchwabStreamer + FakeWSTransport."""

import pytest

from ladderbot.execution.brokers import (
    FakeWSTransport, SchwabConfig, SchwabStreamer, StreamerCredentials,
    SERVICE_ACCT_ACTIVITY, SERVICE_QUOTES_FUTURES, SERVICE_QUOTES_OPTION,
    WSError, fetch_streamer_credentials,
)
from ladderbot.execution.brokers.http import HttpResponse


# ---------------------------------------------------------------------------
# fixtures / helpers
# ---------------------------------------------------------------------------

def _creds():
    return StreamerCredentials(
        streamer_socket_url="wss://streamer-api.schwab.com/ws",
        schwab_client_customer_id="scid-1",
        schwab_client_correlation_id="corr-1",
        schwab_client_channel="N9",
        schwab_client_function_id="APIAPP",
    )


def _cfg():
    return SchwabConfig(account_hash="acct-1", access_token="tok-1")


def _wired_streamer():
    ws = FakeWSTransport()
    streamer = SchwabStreamer(config=_cfg(), credentials=_creds(), ws=ws)
    streamer.login()
    return streamer, ws


# ---------------------------------------------------------------------------
# credentials helper
# ---------------------------------------------------------------------------

def test_from_user_preference_extracts_streamer_info():
    body = {"streamerInfo": [{
        "streamerSocketUrl": "wss://x/ws",
        "schwabClientCustomerId": "cid",
        "schwabClientCorrelId":   "corr",
        "schwabClientChannel":    "CH",
        "schwabClientFunctionId": "FN",
    }]}
    creds = StreamerCredentials.from_user_preference(body)
    assert creds.streamer_socket_url == "wss://x/ws"
    assert creds.schwab_client_customer_id == "cid"
    assert creds.schwab_client_channel == "CH"


def test_from_user_preference_rejects_missing_streamer_info():
    with pytest.raises(ValueError):
        StreamerCredentials.from_user_preference({})


def test_fetch_streamer_credentials_uses_bearer_and_url():
    class Tx:
        def __init__(self): self.calls = []
        def request(self, method, url, **kw):
            self.calls.append({"method": method, "url": url, **kw})
            return HttpResponse(status=200, body={"streamerInfo": [{
                "streamerSocketUrl": "wss://ok",
                "schwabClientCustomerId": "cid",
                "schwabClientCorrelId": "corr",
            }]})
    tx = Tx()
    creds = fetch_streamer_credentials(_cfg(), transport=tx)
    assert creds.streamer_socket_url == "wss://ok"
    assert tx.calls[0]["method"] == "GET"
    assert tx.calls[0]["url"].endswith("/userPreference")
    assert tx.calls[0]["headers"]["Authorization"] == "Bearer tok-1"


def test_fetch_streamer_credentials_raises_on_http_error():
    class Tx:
        def request(self, *a, **k):
            return HttpResponse(status=401, body={"error": "unauth"})
    with pytest.raises(RuntimeError):
        fetch_streamer_credentials(_cfg(), transport=Tx())


# ---------------------------------------------------------------------------
# lifecycle
# ---------------------------------------------------------------------------

def test_login_connects_and_sends_admin_login():
    ws = FakeWSTransport()
    streamer = SchwabStreamer(config=_cfg(), credentials=_creds(), ws=ws)
    streamer.login()
    assert ws.connected
    body = ws.last_sent()
    req = body["requests"][0]
    assert req["service"] == "ADMIN"
    assert req["command"] == "LOGIN"
    # Streamer LOGIN accepts the raw bearer token, not a "Bearer …" header.
    assert req["parameters"]["Authorization"] == "tok-1"
    assert req["parameters"]["SchwabClientCustomerId"] == "scid-1"


def test_logout_closes_and_sends_admin_logout():
    streamer, ws = _wired_streamer()
    streamer.logout()
    logout = ws.sent[-1]["requests"][0]
    assert logout["service"] == "ADMIN"
    assert logout["command"] == "LOGOUT"
    assert not ws.connected


def test_send_before_connect_raises():
    ws = FakeWSTransport()
    with pytest.raises(WSError):
        ws.send({"anything": True})


# ---------------------------------------------------------------------------
# subscriptions
# ---------------------------------------------------------------------------

def test_subscribe_quotes_sends_ADD_with_symbols_and_registers_callback():
    streamer, ws = _wired_streamer()
    received = []
    streamer.subscribe_quotes(["/CL   240621C00082500", "/NQ   240621C00018000"],
                              lambda sym, c: received.append((sym, c)))
    sub = ws.sent[-1]["requests"][0]
    assert sub["service"] == SERVICE_QUOTES_OPTION
    assert sub["command"] == "ADD"
    assert "/CL" in sub["parameters"]["keys"]
    assert "/NQ" in sub["parameters"]["keys"]

    ws.push_server({"data": [{
        "service": SERVICE_QUOTES_OPTION,
        "content": [
            {"key": "/CL   240621C00082500", "bid": 2.35, "ask": 2.40, "last": 2.37},
        ],
    }]})
    assert streamer.pump() == 1
    assert received == [("/CL   240621C00082500",
                         {"key": "/CL   240621C00082500",
                          "bid": 2.35, "ask": 2.40, "last": 2.37})]


def test_subscribe_quotes_deduplicates_and_reuses_callback_map():
    streamer, ws = _wired_streamer()
    streamer.subscribe_quotes(["A"], lambda s, c: None)
    n_after_first = len(ws.sent)
    streamer.subscribe_quotes(["A"], lambda s, c: None)  # already subscribed
    assert len(ws.sent) == n_after_first
    streamer.subscribe_quotes(["A", "B"], lambda s, c: None)
    add = ws.sent[-1]["requests"][0]
    assert add["parameters"]["keys"] == "B"           # only new key


def test_unsubscribe_quotes_removes_symbol_and_callback():
    streamer, ws = _wired_streamer()
    streamer.subscribe_quotes(["A"], lambda s, c: None)
    streamer.unsubscribe_quotes(["A"])
    last = ws.sent[-1]["requests"][0]
    assert last["command"] == "UNSUBS"
    assert last["parameters"]["keys"] == "A"

    # Any inbound A quote is now a no-op
    ws.push_server({"data": [{
        "service": SERVICE_QUOTES_OPTION,
        "content": [{"key": "A", "bid": 1.0}],
    }]})
    streamer.pump()   # no exception, no exception


def test_subscribe_account_activity_and_dispatch():
    streamer, ws = _wired_streamer()
    received = []
    streamer.subscribe_account_activity(lambda evt: received.append(evt))
    add = ws.sent[-1]["requests"][0]
    assert add["service"] == SERVICE_ACCT_ACTIVITY
    assert add["command"] == "SUBS"
    assert add["parameters"]["keys"] == "acct-1"

    ws.push_server({"data": [{
        "service": SERVICE_ACCT_ACTIVITY,
        "content": [{"1": "acct-1", "3": "OrderFillMessage",
                     "2": "OID-1", "extra": {"filledQty": 5}}],
    }]})
    streamer.pump()
    assert len(received) == 1
    assert received[0]["3"] == "OrderFillMessage"


def test_subscribe_account_activity_is_idempotent():
    streamer, ws = _wired_streamer()
    streamer.subscribe_account_activity(lambda evt: None)
    n_after_first = len(ws.sent)
    streamer.subscribe_account_activity(lambda evt: None)   # extra callback
    assert len(ws.sent) == n_after_first                     # no dup SUBS


# ---------------------------------------------------------------------------
# pump behavior
# ---------------------------------------------------------------------------

def test_pump_drains_up_to_max_messages():
    streamer, ws = _wired_streamer()
    for i in range(5):
        ws.push_server({"notify": [{"heartbeat": i}]})
    n = streamer.pump(max_messages=3, timeout=0.01)
    assert n == 3


def test_pump_ignores_unknown_services_gracefully():
    streamer, ws = _wired_streamer()
    ws.push_server({"data": [{"service": "SOMETHING_WEIRD", "content": [{}]}]})
    # Should not throw
    streamer.pump()


def test_pump_survives_callback_exception():
    streamer, ws = _wired_streamer()
    streamer.subscribe_quotes(["A"], lambda s, c: (_ for _ in ()).throw(RuntimeError("boom")))
    ws.push_server({"data": [{
        "service": SERVICE_QUOTES_OPTION,
        "content": [{"key": "A", "bid": 1.0}],
    }]})
    # Should not raise; error is logged
    streamer.pump()


def test_pump_dispatches_futures_and_options_services():
    streamer, ws = _wired_streamer()
    calls = []
    streamer.subscribe_quotes(["/CL"], lambda s, c: calls.append(("opt", s, c)),
                              service=SERVICE_QUOTES_OPTION)
    streamer.subscribe_quotes(["/ZS"], lambda s, c: calls.append(("fut", s, c)),
                              service=SERVICE_QUOTES_FUTURES)
    ws.push_server({"data": [
        {"service": SERVICE_QUOTES_OPTION,  "content": [{"key": "/CL", "bid": 1}]},
        {"service": SERVICE_QUOTES_FUTURES, "content": [{"key": "/ZS", "bid": 2}]},
    ]})
    streamer.pump()
    assert ("opt", "/CL", {"key": "/CL", "bid": 1}) in calls
    assert ("fut", "/ZS", {"key": "/ZS", "bid": 2}) in calls
