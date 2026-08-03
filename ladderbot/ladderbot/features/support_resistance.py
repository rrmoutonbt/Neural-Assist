"""Support/resistance detection via swing-pivot detection + clustering."""

from dataclasses import dataclass
from typing import List, Tuple, Optional

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Level:
    price: float
    strength: int          # touches contributing to the cluster
    kind: str              # "support" | "resistance"


def swing_pivots(df: pd.DataFrame, left: int = 3, right: int = 3) -> Tuple[pd.Series, pd.Series]:
    """Fractal-style swing highs and lows.

    A bar is a swing high if its high is >= the highs of `left` bars before
    and `right` bars after; symmetric for swing low.
    """
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    n = len(df)
    hi_mask = np.zeros(n, dtype=bool)
    lo_mask = np.zeros(n, dtype=bool)
    for i in range(left, n - right):
        window_hi = high.iloc[i - left : i + right + 1]
        window_lo = low.iloc[i - left : i + right + 1]
        if high.iloc[i] == window_hi.max():
            hi_mask[i] = True
        if low.iloc[i] == window_lo.min():
            lo_mask[i] = True
    return pd.Series(hi_mask, index=df.index), pd.Series(lo_mask, index=df.index)


def cluster_levels(
    pivot_prices: List[float],
    tolerance_pct: float = 0.003,
    min_touches: int = 2,
    kind: str = "resistance",
) -> List[Level]:
    """Greedy 1-D clustering of pivot prices within tolerance_pct of each other."""
    if not pivot_prices:
        return []
    prices = sorted(pivot_prices)
    clusters: List[List[float]] = [[prices[0]]]
    for p in prices[1:]:
        anchor = np.mean(clusters[-1])
        if abs(p - anchor) / anchor <= tolerance_pct:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return [
        Level(price=float(np.mean(c)), strength=len(c), kind=kind)
        for c in clusters if len(c) >= min_touches
    ]


def detect_levels(df: pd.DataFrame, left: int = 3, right: int = 3,
                  tolerance_pct: float = 0.003, min_touches: int = 2) -> List[Level]:
    hi_mask, lo_mask = swing_pivots(df, left=left, right=right)
    resistances = cluster_levels(df.loc[hi_mask, "high"].tolist(),
                                 tolerance_pct=tolerance_pct, min_touches=min_touches, kind="resistance")
    supports    = cluster_levels(df.loc[lo_mask, "low"].tolist(),
                                 tolerance_pct=tolerance_pct, min_touches=min_touches, kind="support")
    return sorted(resistances + supports, key=lambda l: l.price)


def nearest_levels(price: float, levels: List[Level]) -> Tuple[Optional[Level], Optional[Level]]:
    """Return (nearest_support_below, nearest_resistance_above)."""
    below = [l for l in levels if l.price < price]
    above = [l for l in levels if l.price > price]
    support    = max(below, key=lambda l: l.price) if below else None
    resistance = min(above, key=lambda l: l.price) if above else None
    return support, resistance


def clearance_in_atr(price: float, target_level: Optional[Level], atr_value: float) -> float:
    """Distance from price to the given level, expressed in ATR multiples.

    Returns +inf if no level provided or atr is zero (unbounded room to move).
    """
    if target_level is None or atr_value <= 0:
        return float("inf")
    return abs(target_level.price - price) / atr_value
