"""Fibonacci retracement/extension levels + dead-zone rejection flag.

"Dead zone" per the transcript: when price touches a fib level (typically
0.618 / 0.786) and rejects, expect continuation of the prior swing.
"""

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd


RATIOS = (0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618)


@dataclass(frozen=True)
class FibLevel:
    ratio: float
    price: float


def fib_levels(df: pd.DataFrame, window: int = 60) -> Dict[float, float]:
    """Compute retracement + extension prices over the last `window` bars."""
    recent = df.tail(window)
    hi = float(recent["high"].max())
    lo = float(recent["low"].min())
    rng = hi - lo
    return {r: lo + rng * r for r in RATIOS}


def nearest_fib(price: float, levels: Dict[float, float]) -> Tuple[float, float]:
    """Return (ratio, price) of the fib level closest to `price`."""
    ratio, lvl_price = min(levels.items(), key=lambda kv: abs(kv[1] - price))
    return ratio, lvl_price


def dead_zone_flag(
    df: pd.DataFrame,
    window: int = 60,
    lookback_bars: int = 5,
    tolerance_pct: float = 0.004,
    watched_ratios: Tuple[float, ...] = (0.618, 0.786, 1.0),
) -> Optional[Tuple[float, str]]:
    """Detect a recent rejection off one of the watched fib levels.

    Returns (ratio, direction) where direction is 'reject_up' if the level
    acted as resistance (fade long / take a put) or 'reject_down' if it
    acted as support (fade short / take a call). None if no rejection.
    """
    if len(df) < window:
        return None
    levels = fib_levels(df, window=window)
    recent = df.tail(lookback_bars)
    for ratio in watched_ratios:
        lvl = levels[ratio]
        touched_from_below = ((recent["high"] >= lvl * (1 - tolerance_pct)) &
                              (recent["close"] < lvl)).any()
        touched_from_above = ((recent["low"] <= lvl * (1 + tolerance_pct)) &
                              (recent["close"] > lvl)).any()
        if touched_from_below and not touched_from_above:
            return ratio, "reject_up"
        if touched_from_above and not touched_from_below:
            return ratio, "reject_down"
    return None
