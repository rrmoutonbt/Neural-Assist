"""SchwabBroker + SchwabChainProvider.

Implements LadderBroker + OptionChainProvider against Schwab's Trader
API. Every network call goes through an injectable HttpTransport so
tests can drive the adapter without a real Schwab account.

Not implemented here (intentionally out of scope):
  - OAuth2 PKCE token dance — Schwab requires a callback URL and a
    browser step; callers pass in a fresh access_token.
  - Refresh-on-expiry — SchwabConfig carries a token_provider callable
    the adapter calls before each request when the current token is
    within `token_leeway_seconds` of expiry.
  - Streaming quotes — this Sprint adds REST-only quoting; a
    websocket client is a separate follow-up.

Symbol translation:
  Schwab uses OSI symbols. `SchwabBroker._to_osi(request)` builds a
  21-char OSI symbol from the LadderBot OrderRequest, matching how
  the transcript speaker's futures options are quoted (/CL, /NQ,
  /ZS…) on the ThinkOrSwim platform.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from ..chain_provider import (
    ChainQuote, ChainSnapshot, OptionChainProvider,
)
from ..order import (
    Fill, LadderOrder, OrderRequest, OrderSide, OrderStatus,
)

from .http import HttpError, HttpTransport, RequestsTransport
from .osi import osi_symbol


DEFAULT_BASE_URL = "https://api.schwabapi.com/trader/v1"
DEFAULT_MARKET_URL = "https://api.schwabapi.com/marketdata/v1"


@dataclass
class SchwabConfig:
    account_hash: str
    access_token: Optional[str] = None
    token_provider: Optional[Callable[[], str]] = None
    base_url: str = DEFAULT_BASE_URL
    market_url: str = DEFAULT_MARKET_URL
    request_timeout_seconds: float = 10.0
    slippage_ticks: float = 0.0
    tick_size: float = 0.01

    def bearer(self) -> str:
        if self.token_provider is not None:
            return self.token_provider()
        if self.access_token is None:
            raise RuntimeError(
                "SchwabConfig needs either an access_token or a token_provider",
            )
        return self.access_token


# ═══════════════════════════════════════════════════════════════════════════
# BROKER
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class SchwabBroker:
    config: SchwabConfig
    transport: HttpTransport = field(default_factory=RequestsTransport)
    orders_by_id: Dict[str, LadderOrder] = field(default_factory=dict)

    # ------------------------------------------------------------------
    # LadderBroker protocol
    # ------------------------------------------------------------------

    def submit(self, request: OrderRequest) -> LadderOrder:
        order = LadderOrder(
            request=request, status=OrderStatus.PENDING,
            submitted_at=datetime.now(),
        )
        self.orders_by_id[order.order_id] = order

        payload = self._build_order_payload(request)
        url = f"{self.config.base_url}/accounts/{self.config.account_hash}/orders"

        try:
            resp = self.transport.request(
                "POST", url, json=payload, headers=self._auth_headers(),
                timeout=self.config.request_timeout_seconds,
            )
        except HttpError as e:
            order.status = OrderStatus.REJECTED
            order.reject_reason = f"transport: HTTP {e.status}"
            order.completed_at = datetime.now()
            return order
        except Exception as e:
            order.status = OrderStatus.REJECTED
            order.reject_reason = f"transport: {type(e).__name__}: {e}"
            order.completed_at = datetime.now()
            return order

        if not resp.ok:
            order.status = OrderStatus.REJECTED
            order.reject_reason = _extract_error(resp.body)
            order.completed_at = datetime.now()
            return order

        # Schwab returns the venue order-id in the Location header.
        # Re-key the entry under the venue id and drop the temporary uuid
        # so downstream (poller, dedup) sees exactly one record per order.
        schwab_id = _order_id_from_location(resp.headers.get("Location"))
        if schwab_id and schwab_id != order.order_id:
            self.orders_by_id.pop(order.order_id, None)
            order.order_id = schwab_id
            self.orders_by_id[schwab_id] = order

        order.status = OrderStatus.SUBMITTED

        # If the body carries fills already (marketable order acked with fills),
        # apply them straight through.
        for f in _fills_from_body(resp.body):
            order.add_fill(price_points=f["price"], contracts=f["quantity"])

        return order

    def cancel(self, order_id: str) -> LadderOrder:
        order = self.orders_by_id.get(order_id)
        if order is None:
            raise KeyError(f"unknown order_id {order_id}")
        if order.status in (OrderStatus.FILLED, OrderStatus.CANCELED,
                            OrderStatus.REJECTED):
            return order
        url = (f"{self.config.base_url}/accounts/{self.config.account_hash}"
               f"/orders/{order_id}")
        resp = self.transport.request(
            "DELETE", url, headers=self._auth_headers(),
            timeout=self.config.request_timeout_seconds,
        )
        if resp.ok:
            order.status = OrderStatus.CANCELED
            order.completed_at = datetime.now()
        else:
            order.reject_reason = _extract_error(resp.body)
        return order

    def current_option_mid(self, order: LadderOrder) -> Optional[float]:
        osi = self._to_osi(order.request)
        chain = self._fetch_chain_snapshot(
            symbol=order.request.symbol,
            target_dte=max(1, (order.request.expiration - date.today()).days),
        )
        if chain is None:
            return None
        for q in chain.quotes:
            if abs(q.strike - order.request.strike) < 1e-6 and \
               q.option_type == order.request.option_type:
                return float(q.mid)
        return None

    def orders(self) -> List[LadderOrder]:
        return list(self.orders_by_id.values())

    # ------------------------------------------------------------------
    # Poller integration
    # ------------------------------------------------------------------

    @property
    def poller(self):
        """Lazy SchwabOrderPoller bound to this broker's live state.

        Import is deferred to avoid a circular reference (the poller
        imports SchwabConfig from this module).
        """
        if getattr(self, "_poller_cache", None) is None:
            from .schwab_poller import SchwabOrderPoller
            self._poller_cache = SchwabOrderPoller(
                config=self.config,
                orders_by_id=self.orders_by_id,
                transport=self.transport,
            )
        return self._poller_cache

    def poll_open_orders(self):
        """Convenience: poll every non-terminal order once.

        Returns the list of PollResult from SchwabOrderPoller.poll_once().
        Caller schedules invocation (LadderLiveRunner.tick, cron, etc.).
        """
        return self.poller.poll_once()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _auth_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.bearer()}",
            "Content-Type": "application/json",
        }

    def _to_osi(self, req: OrderRequest) -> str:
        # LadderBot's futures symbols (CL, NQ, ...) map to Schwab's
        # slash-prefixed roots (/CL, /NQ, ...).
        return osi_symbol(
            root=req.symbol, expiration=req.expiration,
            option_type=req.option_type, strike=req.strike,
            is_future=True,
        )

    def _build_order_payload(self, req: OrderRequest) -> Dict[str, Any]:
        instruction = ("BUY_TO_OPEN" if req.side == OrderSide.BUY_TO_OPEN
                       else "SELL_TO_CLOSE")
        order_type = "LIMIT" if req.limit_price is not None else "MARKET"
        leg = {
            "instruction": instruction,
            "quantity": int(req.contracts),
            "instrument": {
                "symbol": self._to_osi(req),
                "assetType": "OPTION",
            },
        }
        payload: Dict[str, Any] = {
            "session":      "NORMAL",
            "duration":     "DAY",
            "orderType":    order_type,
            "orderStrategyType": "SINGLE",
            "clientOrderId": req.client_order_id,
            "orderLegCollection": [leg],
        }
        if req.limit_price is not None:
            payload["price"] = round(float(req.limit_price), 2)
        return payload

    def _fetch_chain_snapshot(
        self, symbol: str, target_dte: int,
    ) -> Optional[ChainSnapshot]:
        provider = SchwabChainProvider(config=self.config, transport=self.transport)
        return provider.get_chain(symbol=symbol, target_dte=target_dte)


# ═══════════════════════════════════════════════════════════════════════════
# CHAIN PROVIDER
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class SchwabChainProvider:
    config: SchwabConfig
    transport: HttpTransport = field(default_factory=RequestsTransport)

    def get_chain(self, symbol: str, target_dte: int) -> Optional[ChainSnapshot]:
        params = {
            "symbol": f"/{symbol.lstrip('/')}",
            "contractType": "ALL",
            "includeUnderlyingQuote": "true",
            "range": "NTM",
            "daysToExpiration": int(target_dte),
        }
        url = f"{self.config.market_url}/chains"
        try:
            resp = self.transport.request(
                "GET", url, params=params, headers=self._auth_headers(),
                timeout=self.config.request_timeout_seconds,
            )
        except Exception:
            return None
        if not resp.ok:
            return None

        body = resp.body if isinstance(resp.body, dict) else {}
        underlying_price = float(
            (body.get("underlying") or {}).get("mark")
            or (body.get("underlying") or {}).get("last")
            or 0.0,
        )
        if underlying_price <= 0:
            return None

        quotes: List[ChainQuote] = []
        earliest: Optional[date] = None
        for map_key in ("callExpDateMap", "putExpDateMap"):
            option_type = "call" if map_key.startswith("call") else "put"
            for exp_key, strike_map in (body.get(map_key) or {}).items():
                exp = _parse_exp_key(exp_key)
                if exp is None:
                    continue
                if earliest is None or exp < earliest:
                    earliest = exp
                for strike_str, contracts in (strike_map or {}).items():
                    if not contracts:
                        continue
                    c = contracts[0]
                    quotes.append(ChainQuote(
                        symbol=symbol,
                        strike=float(strike_str),
                        option_type=option_type,
                        bid=float(c.get("bid") or 0.0),
                        ask=float(c.get("ask") or 0.0),
                        last=float(c.get("last") or 0.0) or None,
                        volume=int(c.get("totalVolume") or 0) or None,
                        open_interest=int(c.get("openInterest") or 0) or None,
                        iv=(float(c["volatility"]) / 100.0
                            if c.get("volatility") not in (None, "NaN") else None),
                        delta=(float(c["delta"])
                               if c.get("delta") not in (None, "NaN") else None),
                    ))

        exp = earliest or date.today()
        dte = max(1, (exp - date.today()).days)
        return ChainSnapshot(
            symbol=symbol, underlying_price=underlying_price,
            expiration=exp, days_to_expiration=dte, quotes=quotes,
            risk_free_rate=0.05, cost_of_carry=0.0,
        )

    def _auth_headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.config.bearer()}"}


# ═══════════════════════════════════════════════════════════════════════════
# helpers
# ═══════════════════════════════════════════════════════════════════════════

def _extract_error(body: Any) -> str:
    if isinstance(body, dict):
        for k in ("message", "error", "detail", "errors"):
            v = body.get(k)
            if v:
                return str(v)
    if isinstance(body, (bytes, str)):
        return str(body)[:400]
    return "unknown error"


def _order_id_from_location(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    # Location header form: .../orders/<orderId>
    parts = location.rstrip("/").split("/")
    return parts[-1] if parts and parts[-1] else None


def _fills_from_body(body: Any) -> List[Dict[str, float]]:
    """Extract fills the venue chose to ack in the response body.

    Most Schwab submits ack empty and require GET /orders/{id} to poll
    for fills; this helper handles the rare cases where fills come
    inline. Returns [] if none.
    """
    if not isinstance(body, dict):
        return []
    legs = ((body.get("orderActivityCollection") or [])
            if body else [])
    out: List[Dict[str, float]] = []
    for activity in legs:
        for leg in (activity.get("executionLegs") or []):
            out.append({
                "price":    float(leg.get("price", 0.0)),
                "quantity": int(leg.get("quantity", 0)),
            })
    return out


def _parse_exp_key(key: str) -> Optional[date]:
    """Schwab formats expiration keys as 'YYYY-MM-DD:N' where N is DTE."""
    try:
        head = key.split(":", 1)[0]
        parts = head.split("-")
        return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except (ValueError, IndexError):
        return None
