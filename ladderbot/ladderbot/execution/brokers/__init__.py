"""LadderBot broker adapters.

Each adapter implements the LadderBroker protocol (see broker.py) so
LadderExecutionEngine can drive real venues without knowing which one.

Included:
    - schwab_broker.py: Charles Schwab Trader API (the successor to
      the TDA / ThinkOrSwim API named in the source transcript). Also
      ships SchwabChainProvider that satisfies OptionChainProvider.

External requirements (Schwab):
    - A Schwab developer account, a registered app, and an OAuth2
      access token obtained via Schwab's PKCE flow. This module does
      NOT perform the OAuth dance — callers supply a bearer token.
      See docs at https://developer.schwab.com/products/trader-api.
"""

from .http import HttpTransport, HttpError, RequestsTransport
from .osi import (
    OSIError, osi_symbol, parse_osi_symbol, OSIParts,
)
from .schwab_broker import SchwabBroker, SchwabChainProvider, SchwabConfig
from .schwab_poller import (
    PollResult, SchwabOrderPoller, SCHWAB_STATUS, TERMINAL_STATES,
)
from .schwab_streamer import (
    SchwabStreamer, StreamerCredentials, fetch_streamer_credentials,
    SERVICE_QUOTES_OPTION, SERVICE_QUOTES_FUTURES, SERVICE_ACCT_ACTIVITY,
)
from .ws_transport import WSTransport, WSError, WebsocketsTransport, FakeWSTransport

__all__ = [
    "HttpTransport", "HttpError", "RequestsTransport",
    "OSIError", "osi_symbol", "parse_osi_symbol", "OSIParts",
    "SchwabBroker", "SchwabChainProvider", "SchwabConfig",
    "SchwabOrderPoller", "PollResult", "SCHWAB_STATUS", "TERMINAL_STATES",
    "SchwabStreamer", "StreamerCredentials", "fetch_streamer_credentials",
    "SERVICE_QUOTES_OPTION", "SERVICE_QUOTES_FUTURES", "SERVICE_ACCT_ACTIVITY",
    "WSTransport", "WSError", "WebsocketsTransport", "FakeWSTransport",
]
