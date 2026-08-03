"""Futures instrument table with tick economics.

Drives point->dollar conversion for the trace slip and sets the
per-option $ target math (default $225 per option, per Ms. Juanita's method).
"""

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class Instrument:
    symbol: str
    name: str
    dollars_per_point: float
    tick_size: float
    typical_option_premium: float  # rough average, informs sizing
    session: str = "RTH"  # RTH | ETH

    def points_to_dollars(self, points: float) -> float:
        return points * self.dollars_per_point

    def dollars_to_points(self, dollars: float) -> float:
        if self.dollars_per_point == 0:
            raise ValueError(f"{self.symbol} has zero dollars_per_point")
        return dollars / self.dollars_per_point

    def points_to_target(self, dollar_target: float) -> float:
        return self.dollars_to_points(dollar_target)


INSTRUMENTS: Dict[str, Instrument] = {
    "CL": Instrument("CL", "Crude Oil",     dollars_per_point=10.0, tick_size=0.01, typical_option_premium=800),
    "NQ": Instrument("NQ", "Nasdaq 100",    dollars_per_point=20.0, tick_size=0.25, typical_option_premium=1200),
    "ES": Instrument("ES", "S&P 500",       dollars_per_point=50.0, tick_size=0.25, typical_option_premium=1000),
    "GC": Instrument("GC", "Gold",          dollars_per_point=10.0, tick_size=0.10, typical_option_premium=900),
    "ZS": Instrument("ZS", "Soybeans",      dollars_per_point=50.0, tick_size=0.25, typical_option_premium=700),
    "ZW": Instrument("ZW", "Wheat",         dollars_per_point=50.0, tick_size=0.25, typical_option_premium=650),
    "ZC": Instrument("ZC", "Corn",          dollars_per_point=50.0, tick_size=0.25, typical_option_premium=600),
    "ZO": Instrument("ZO", "Oats",          dollars_per_point=50.0, tick_size=0.25, typical_option_premium=550),
}


def get(symbol: str) -> Instrument:
    if symbol not in INSTRUMENTS:
        raise KeyError(f"Unknown futures symbol: {symbol}")
    return INSTRUMENTS[symbol]
