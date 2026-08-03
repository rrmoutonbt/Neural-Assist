"""Option chain provider protocol + built-in implementations.

- OptionChainProvider: the abstract interface any real-broker adapter
  must implement.
- SyntheticChainProvider: BS-priced strikes around ATM. Used in
  backtests, unit tests, and until a real chain feed is wired.
- FileChainProvider: loads a chain snapshot from CSV/JSON on disk.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from math import exp, log, sqrt
from typing import Callable, Dict, List, Optional, Protocol

import numpy as np


@dataclass
class ChainQuote:
    symbol: str
    strike: float
    option_type: str          # "call" | "put"
    bid: float                # premium in points
    ask: float
    last: Optional[float] = None
    volume: Optional[int] = None
    open_interest: Optional[int] = None
    iv: Optional[float] = None
    delta: Optional[float] = None

    @property
    def mid(self) -> float:
        return 0.5 * (self.bid + self.ask)


@dataclass
class ChainSnapshot:
    symbol: str
    underlying_price: float
    expiration: date
    days_to_expiration: int
    quotes: List[ChainQuote] = field(default_factory=list)
    as_of: datetime = field(default_factory=datetime.now)
    risk_free_rate: float = 0.05
    cost_of_carry: float = 0.0        # 0 for futures (Black-76)

    def calls(self) -> List[ChainQuote]:
        return [q for q in self.quotes if q.option_type == "call"]

    def puts(self) -> List[ChainQuote]:
        return [q for q in self.quotes if q.option_type == "put"]


class OptionChainProvider(Protocol):
    def get_chain(self, symbol: str, target_dte: int) -> Optional[ChainSnapshot]: ...


# ---------------------------------------------------------------------------
# Synthetic provider: BS-priced strikes around ATM.
# ---------------------------------------------------------------------------

def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + _erf(x / sqrt(2.0)))


def _erf(x: float) -> float:
    # Abramowitz-Stegun 7.1.26 approximation, plenty accurate for chain sim
    a1, a2, a3, a4, a5 = 0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429
    p = 0.3275911
    sign = 1 if x >= 0 else -1
    x = abs(x)
    t = 1.0 / (1.0 + p * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * exp(-x * x)
    return sign * y


def _bs_call_put(S: float, K: float, T: float, r: float, sigma: float, b: float, option_type: str):
    vt = sigma * sqrt(T)
    d1 = (log(S / K) + (b + 0.5 * sigma * sigma) * T) / vt
    d2 = d1 - vt
    e_bT = exp((b - r) * T)
    e_rT = exp(-r * T)
    if option_type == "call":
        price = S * e_bT * _norm_cdf(d1) - K * e_rT * _norm_cdf(d2)
        delta = e_bT * _norm_cdf(d1)
    else:
        price = K * e_rT * _norm_cdf(-d2) - S * e_bT * _norm_cdf(-d1)
        delta = e_bT * (_norm_cdf(d1) - 1.0)
    return price, delta


@dataclass
class SyntheticChainSpec:
    """Per-symbol synthetic chain parameters."""
    underlying_provider: Callable[[str], float]   # symbol -> spot
    iv_provider: Callable[[str], float] = lambda s: 0.28
    strike_spacing: float = 1.0
    strikes_each_side: int = 8
    risk_free_rate: float = 0.05
    cost_of_carry: float = 0.0
    bid_ask_spread_pct: float = 0.02              # 2% of mid


class SyntheticChainProvider:
    """Generates a plausible option chain from an underlying spot + IV."""

    def __init__(self, spec: SyntheticChainSpec):
        self.spec = spec

    def get_chain(self, symbol: str, target_dte: int) -> Optional[ChainSnapshot]:
        s = self.spec
        try:
            S = float(s.underlying_provider(symbol))
        except Exception:
            return None
        iv = float(s.iv_provider(symbol))
        dte = max(1, int(target_dte))
        T = dte / 365.0
        atm = round(S / s.strike_spacing) * s.strike_spacing
        strikes = [atm + i * s.strike_spacing
                   for i in range(-s.strikes_each_side, s.strikes_each_side + 1)]

        quotes: List[ChainQuote] = []
        for K in strikes:
            for opt_type in ("call", "put"):
                price, delta = _bs_call_put(S, K, T, s.risk_free_rate, iv, s.cost_of_carry, opt_type)
                mid = max(0.05, price)
                half = 0.5 * mid * s.bid_ask_spread_pct
                quotes.append(ChainQuote(
                    symbol=symbol, strike=K, option_type=opt_type,
                    bid=max(0.01, mid - half), ask=mid + half,
                    last=mid, iv=iv, delta=delta,
                ))
        return ChainSnapshot(
            symbol=symbol, underlying_price=S,
            expiration=date.today() + timedelta(days=dte),
            days_to_expiration=dte, quotes=quotes,
            risk_free_rate=s.risk_free_rate, cost_of_carry=s.cost_of_carry,
        )


# ---------------------------------------------------------------------------
# File-backed provider: load pre-recorded chain snapshots from disk.
# ---------------------------------------------------------------------------

class FileChainProvider:
    """Loads chain snapshots from a directory of CSV files.

    Expected layout: {root}/{symbol}_{yyyymmdd}.csv
    Columns: strike, option_type, bid, ask, [last, iv, delta, volume, open_interest]
    """

    def __init__(self, root: str, underlying_provider: Callable[[str], float],
                 expiration_provider: Optional[Callable[[str, int], date]] = None):
        self.root = root
        self.underlying_provider = underlying_provider
        self.expiration_provider = expiration_provider

    def get_chain(self, symbol: str, target_dte: int) -> Optional[ChainSnapshot]:
        import csv
        import glob
        import os

        pattern = os.path.join(self.root, f"{symbol}_*.csv")
        matches = sorted(glob.glob(pattern))
        if not matches:
            return None
        path = matches[-1]
        quotes: List[ChainQuote] = []
        with open(path, newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                quotes.append(ChainQuote(
                    symbol=symbol,
                    strike=float(row["strike"]),
                    option_type=row["option_type"].strip().lower(),
                    bid=float(row["bid"]),
                    ask=float(row["ask"]),
                    last=float(row["last"]) if row.get("last") else None,
                    iv=float(row["iv"]) if row.get("iv") else None,
                    delta=float(row["delta"]) if row.get("delta") else None,
                    volume=int(row["volume"]) if row.get("volume") else None,
                    open_interest=int(row["open_interest"]) if row.get("open_interest") else None,
                ))
        S = float(self.underlying_provider(symbol))
        exp = self.expiration_provider(symbol, target_dte) if self.expiration_provider \
              else date.today() + timedelta(days=target_dte)
        dte = max(1, (exp - date.today()).days)
        return ChainSnapshot(symbol=symbol, underlying_price=S,
                             expiration=exp, days_to_expiration=dte, quotes=quotes)


def pick_strike_by_delta(chain: ChainSnapshot, target_delta: float,
                         option_type: str) -> Optional[ChainQuote]:
    """Return the quote whose |delta| is closest to target_delta."""
    candidates = [q for q in chain.quotes
                  if q.option_type == option_type and q.delta is not None]
    if not candidates:
        return None
    target = abs(target_delta)
    return min(candidates, key=lambda q: abs(abs(q.delta) - target))
