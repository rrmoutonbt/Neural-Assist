"""OSI (Options Symbology Initiative) symbol encoder / decoder.

Schwab's Trader API identifies each option by its 21-character OSI
symbol:

        ROOT (6 chars, left-padded with spaces)
      + YYMMDD  (expiration)
      + C|P    (call / put)
      + STRIKE (8 digits, 3 implied decimals so 12.5 → "00012500")

Example: an SPY 2024-06-21 $500 CALL is:

        "SPY   240621C00500000"

Futures options add a leading slash on the root:

        "/CL   240621C00082500"

This module only handles the encoding — Schwab uses OSI verbatim in
the /orders and /marketdata endpoints, so nothing else in the adapter
needs to know about it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date


OSI_RE = re.compile(
    r"^(?P<root>.{6})(?P<exp>\d{6})(?P<pc>[CP])(?P<strike>\d{8})$",
)


class OSIError(ValueError):
    pass


@dataclass(frozen=True)
class OSIParts:
    root: str            # stripped of padding
    expiration: date
    option_type: str     # "call" | "put"
    strike: float


def osi_symbol(
    root: str,
    expiration: date,
    option_type: str,
    strike: float,
    is_future: bool = False,
) -> str:
    """Encode an option to its 21-char OSI symbol.

    Passing `is_future=True` prepends "/" and pads the root to 6
    characters (Schwab convention for futures options).
    """
    if option_type.lower() not in ("call", "put"):
        raise OSIError(f"option_type must be call|put, got {option_type!r}")
    root_stripped = root.strip().upper()
    if is_future and not root_stripped.startswith("/"):
        root_stripped = "/" + root_stripped
    if len(root_stripped) > 6:
        raise OSIError(f"root exceeds 6 chars: {root_stripped!r}")
    root_padded = root_stripped.ljust(6, " ")

    exp = expiration.strftime("%y%m%d")
    pc = "C" if option_type.lower() == "call" else "P"

    # Strike: 8 digits with 3 implied decimals.
    scaled = round(strike * 1000)
    if scaled < 0 or scaled > 99_999_999:
        raise OSIError(f"strike out of encodable range: {strike}")
    strike_str = f"{scaled:08d}"

    return f"{root_padded}{exp}{pc}{strike_str}"


def parse_osi_symbol(symbol: str) -> OSIParts:
    """Round-trip parser for validation + testing."""
    if not isinstance(symbol, str) or len(symbol) != 21:
        raise OSIError(f"OSI symbol must be 21 chars, got {symbol!r}")
    m = OSI_RE.match(symbol)
    if not m:
        raise OSIError(f"symbol does not match OSI grammar: {symbol!r}")
    root = m.group("root").rstrip()
    exp_str = m.group("exp")
    try:
        exp = date(2000 + int(exp_str[0:2]),
                   int(exp_str[2:4]),
                   int(exp_str[4:6]))
    except ValueError as e:
        raise OSIError(f"bad expiration in {symbol!r}: {e}") from e
    return OSIParts(
        root=root,
        expiration=exp,
        option_type="call" if m.group("pc") == "C" else "put",
        strike=int(m.group("strike")) / 1000.0,
    )
