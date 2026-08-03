"""Option chain snapshot + strike selection utilities."""

from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional, Sequence

from .greeks import bs_greeks, implied_volatility


@dataclass
class OptionQuote:
    strike: float
    option_type: str          # "call" | "put"
    bid: float
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
class OptionChain:
    symbol: str
    underlying_price: float
    expiration: date
    days_to_expiration: int
    risk_free_rate: float = 0.05
    cost_of_carry: float = 0.0     # 0 for futures options (Black-76)
    quotes: List[OptionQuote] = field(default_factory=list)

    def enrich_greeks(self) -> None:
        """Populate iv and delta on every quote via BS."""
        T = max(self.days_to_expiration, 1) / 365.0
        for q in self.quotes:
            if q.iv is None or q.iv <= 0:
                q.iv = implied_volatility(
                    price=q.mid, S=self.underlying_price, K=q.strike, T=T,
                    r=self.risk_free_rate, option_type=q.option_type,
                    cost_of_carry=self.cost_of_carry,
                )
            if q.iv is not None and q.iv == q.iv:  # not NaN
                try:
                    g = bs_greeks(self.underlying_price, q.strike, T,
                                  self.risk_free_rate, q.iv, q.option_type,
                                  cost_of_carry=self.cost_of_carry)
                    q.delta = g.delta
                except ValueError:
                    q.delta = None

    def atm_iv(self) -> Optional[float]:
        if not self.quotes:
            return None
        closest = min(self.quotes, key=lambda q: abs(q.strike - self.underlying_price))
        return closest.iv


def pick_strike_by_delta(
    chain: OptionChain,
    target_delta: float = 0.38,
    option_type: str = "call",
) -> Optional[OptionQuote]:
    """Return the quote whose |delta| is closest to `target_delta`.

    Assumes chain.enrich_greeks() has already been called if quotes lack delta.
    """
    candidates = [q for q in chain.quotes if q.option_type == option_type and q.delta is not None]
    if not candidates:
        return None
    target = abs(target_delta)
    return min(candidates, key=lambda q: abs(abs(q.delta) - target))
