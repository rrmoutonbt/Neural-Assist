"""SchwabStreamer.

Real-time market data + account activity via Schwab's WebSocket
streamer. Sits alongside SchwabBroker; either can be used
independently, but the pair together removes the last "polling"
step from the LadderBot runtime — quote pushes replace REST /chains
polls for open trades, and account-activity pushes replace the
per-tick GET /orders/{id} poller.

Deployment note:
  The transcript's operator wanted a laptop-friendly ThinkOrSwim
  setup; a WebSocket keep-alive is the wrong choice for that. This
  module is written for a VPS or long-running host process.

Wire format (Schwab Trader API streamer):
  outbound  →  {"requests": [{"service": "…", "command": "LOGIN|SUBS|…", ...}]}
  inbound   ←  {"notify": [...]}     heartbeat/system pings
                {"response": [...]}   ack of a request
                {"data": [{ "service": "…", "content": [...] }]}

Rather than model every field, this class routes messages by
`service` string and hands the parsed content dict to the caller's
registered callback. That keeps the streamer thin and lets the
caller (LadderLiveRunner, our own tests) evolve the parsing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional

from .http import HttpTransport, RequestsTransport
from .schwab_broker import SchwabConfig
from .ws_transport import WSTransport, WebsocketsTransport


log = logging.getLogger(__name__)


# Schwab service names we consume today. Streamer supports many more.
SERVICE_QUOTES_OPTION  = "LEVELONE_FUTURES_OPTIONS"
SERVICE_QUOTES_FUTURES = "LEVELONE_FUTURES"
SERVICE_ACCT_ACTIVITY  = "ACCT_ACTIVITY"


QuoteCallback = Callable[[str, Dict[str, Any]], None]     # (symbol, content)
ActivityCallback = Callable[[Dict[str, Any]], None]


@dataclass
class StreamerCredentials:
    """Everything the streamer LOGIN admin message needs.

    Populate from Schwab's GET /trader/v1/userPreference response
    (its `streamerInfo` block). Fields kept as-is to match Schwab's
    wire names.
    """
    streamer_socket_url: str
    schwab_client_customer_id: str          # scID
    schwab_client_correlation_id: str       # scCorrelId
    schwab_client_channel: str
    schwab_client_function_id: str

    @classmethod
    def from_user_preference(cls, body: Dict[str, Any]) -> "StreamerCredentials":
        infos = body.get("streamerInfo") or []
        if not infos:
            raise ValueError("userPreference response has no streamerInfo")
        s = infos[0]
        return cls(
            streamer_socket_url        = s["streamerSocketUrl"],
            schwab_client_customer_id  = s["schwabClientCustomerId"],
            schwab_client_correlation_id = s["schwabClientCorrelId"],
            schwab_client_channel      = s.get("schwabClientChannel", ""),
            schwab_client_function_id  = s.get("schwabClientFunctionId", ""),
        )


def fetch_streamer_credentials(
    config: SchwabConfig,
    transport: Optional[HttpTransport] = None,
) -> StreamerCredentials:
    """One-shot GET /trader/v1/userPreference → StreamerCredentials."""
    transport = transport or RequestsTransport()
    url = f"{config.base_url}/userPreference"
    resp = transport.request(
        "GET", url,
        headers={"Authorization": f"Bearer {config.bearer()}"},
        timeout=config.request_timeout_seconds,
    )
    if not resp.ok:
        raise RuntimeError(f"userPreference GET failed: HTTP {resp.status}")
    if not isinstance(resp.body, dict):
        raise RuntimeError(f"userPreference body not JSON: {type(resp.body)}")
    return StreamerCredentials.from_user_preference(resp.body)


# ═══════════════════════════════════════════════════════════════════════════
# Streamer
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class SchwabStreamer:
    config: SchwabConfig
    credentials: StreamerCredentials
    ws: WSTransport = None                                # populated below

    _quote_callbacks: Dict[str, List[QuoteCallback]] = field(default_factory=dict)
    _activity_callbacks: List[ActivityCallback] = field(default_factory=list)
    _next_request_id: int = 0
    _logged_in: bool = False
    _subscribed_quote_symbols: set = field(default_factory=set)
    _account_subscribed: bool = False

    def __post_init__(self):
        if self.ws is None:
            self.ws = WebsocketsTransport(url=self.credentials.streamer_socket_url)

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    def login(self) -> None:
        self.ws.connect()
        self._send_request(
            service="ADMIN", command="LOGIN",
            parameters={
                "Authorization":  self.config.bearer(),
                "SchwabClientChannel":   self.credentials.schwab_client_channel,
                "SchwabClientFunctionId": self.credentials.schwab_client_function_id,
            },
            include_customer_headers=True,
        )
        self._logged_in = True

    def logout(self) -> None:
        if not self._logged_in:
            return
        try:
            self._send_request(service="ADMIN", command="LOGOUT", parameters={})
        finally:
            self._logged_in = False
            self.ws.close()

    # ------------------------------------------------------------------
    # subscriptions
    # ------------------------------------------------------------------

    def subscribe_quotes(
        self,
        symbols: Iterable[str],
        on_quote: QuoteCallback,
        service: str = SERVICE_QUOTES_OPTION,
    ) -> None:
        wanted = set(symbols)
        if not wanted:
            return

        for s in wanted:
            self._quote_callbacks.setdefault(s, []).append(on_quote)

        new_symbols = wanted - self._subscribed_quote_symbols
        if not new_symbols:
            return

        self._send_request(
            service=service, command="ADD",
            parameters={
                "keys":   ",".join(sorted(new_symbols)),
                "fields": "0,1,2,3,4,8,10,28,29,30,31",   # sym/bid/ask/last/…
            },
        )
        self._subscribed_quote_symbols |= new_symbols

    def unsubscribe_quotes(
        self, symbols: Iterable[str],
        service: str = SERVICE_QUOTES_OPTION,
    ) -> None:
        wanted = set(symbols) & self._subscribed_quote_symbols
        if not wanted:
            return
        self._send_request(
            service=service, command="UNSUBS",
            parameters={"keys": ",".join(sorted(wanted))},
        )
        self._subscribed_quote_symbols -= wanted
        for s in wanted:
            self._quote_callbacks.pop(s, None)

    def subscribe_account_activity(self, on_activity: ActivityCallback) -> None:
        self._activity_callbacks.append(on_activity)
        if self._account_subscribed:
            return
        self._send_request(
            service=SERVICE_ACCT_ACTIVITY, command="SUBS",
            parameters={"keys": self.config.account_hash, "fields": "0,1,2,3"},
        )
        self._account_subscribed = True

    # ------------------------------------------------------------------
    # message pump
    # ------------------------------------------------------------------

    def pump(self, max_messages: int = 32, timeout: float = 0.05) -> int:
        """Drain up to `max_messages` incoming messages, dispatching each.

        Returns the number of messages processed. Non-blocking-ish:
        each recv waits at most `timeout` seconds.
        """
        processed = 0
        for _ in range(max_messages):
            msg = self.ws.recv(timeout=timeout)
            if msg is None:
                break
            self._dispatch(msg)
            processed += 1
        return processed

    def pump_forever(self, stop_predicate: Callable[[], bool] = lambda: False,
                     timeout: float = 0.5) -> None:
        """Blocking loop for a dedicated thread. Stop when `stop_predicate` true
        or when the transport closes (recv returns None sentinel)."""
        while not stop_predicate():
            msg = self.ws.recv(timeout=timeout)
            if msg is None:
                if not self.ws.connected:
                    break
                continue
            self._dispatch(msg)

    # ------------------------------------------------------------------
    # internals
    # ------------------------------------------------------------------

    def _dispatch(self, message: Dict[str, Any]) -> None:
        # data pushes → quote / activity callbacks
        for pkt in message.get("data") or []:
            service = pkt.get("service")
            content = pkt.get("content") or []
            if service in (SERVICE_QUOTES_OPTION, SERVICE_QUOTES_FUTURES):
                for c in content:
                    symbol = c.get("key") or c.get("symbol")
                    if not symbol:
                        continue
                    for cb in self._quote_callbacks.get(symbol, []):
                        try: cb(symbol, c)
                        except Exception:
                            log.exception("quote callback failed for %s", symbol)
            elif service == SERVICE_ACCT_ACTIVITY:
                for c in content:
                    for cb in self._activity_callbacks:
                        try: cb(c)
                        except Exception:
                            log.exception("account-activity callback failed")

        # notify/response → log-only for now; caller can subclass to observe
        for pkt in message.get("notify") or []:
            log.debug("streamer notify: %s", pkt)
        for pkt in message.get("response") or []:
            log.debug("streamer response: %s", pkt)

    def _send_request(
        self,
        service: str,
        command: str,
        parameters: Dict[str, Any],
        include_customer_headers: bool = False,
    ) -> None:
        self._next_request_id += 1
        request = {
            "requestid": str(self._next_request_id),
            "service": service,
            "command": command,
            "SchwabClientCustomerId":  self.credentials.schwab_client_customer_id,
            "SchwabClientCorrelId":    self.credentials.schwab_client_correlation_id,
            "parameters": parameters,
        }
        if include_customer_headers:
            # Some LOGIN payloads want these repeated inside `parameters` too.
            request["parameters"].setdefault(
                "SchwabClientCustomerId",
                self.credentials.schwab_client_customer_id,
            )
            request["parameters"].setdefault(
                "SchwabClientCorrelId",
                self.credentials.schwab_client_correlation_id,
            )
        self.ws.send({"requests": [request]})
