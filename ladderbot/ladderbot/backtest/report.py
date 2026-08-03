"""Reporting: monthly hits + transcript profile comparison + aggregates.

TRANSCRIPT_PROFILE is the reference distribution called out in the
Ms. Juanita transcript: May had 10 successful setups, June had 12
(saturating the cycle), July was implied heavy. Aug/Sep/Oct were
described as peak months with 15-16 setups; Nov ~8; Dec lighter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

import pandas as pd

from .simulator import SimulatedTrade


# Reference monthly setup counts from the transcript. Values for months
# not explicitly mentioned are best-fit interpolations of what she
# described — treat as a rough shape, not a guarantee.
TRANSCRIPT_PROFILE: Dict[int, int] = {
    1: 6, 2: 6, 3: 7, 4: 8,
    5: 10, 6: 12, 7: 12,
    8: 15, 9: 16, 10: 15,
    11: 8, 12: 5,
}


@dataclass
class ProfileComparison:
    observed: Dict[int, int]
    expected: Dict[int, int]
    diff: Dict[int, int] = field(default_factory=dict)
    total_observed: int = 0
    total_expected: int = 0
    correlation: float = 0.0


def monthly_hits(trades: Iterable[SimulatedTrade]) -> Dict[int, int]:
    counts: Dict[int, int] = {m: 0 for m in range(1, 13)}
    for t in trades:
        if t.hit_target:
            counts[t.entered_at.month] += 1
    return counts


def monthly_profile_comparison(
    trades: Iterable[SimulatedTrade],
    reference: Optional[Dict[int, int]] = None,
) -> ProfileComparison:
    ref = reference or TRANSCRIPT_PROFILE
    observed = monthly_hits(trades)
    diff = {m: observed.get(m, 0) - ref.get(m, 0) for m in range(1, 13)}
    # Pearson correlation between observed and expected across the 12 months.
    obs = pd.Series([observed.get(m, 0) for m in range(1, 13)], dtype=float)
    exp = pd.Series([ref.get(m, 0) for m in range(1, 13)], dtype=float)
    if obs.std() == 0 or exp.std() == 0:
        corr = 0.0
    else:
        corr = float(obs.corr(exp))
    return ProfileComparison(
        observed=observed, expected=ref, diff=diff,
        total_observed=int(sum(observed.values())),
        total_expected=int(sum(ref.values())),
        correlation=corr,
    )


@dataclass
class AggregateMetrics:
    n_trades: int
    n_hits: int
    hit_rate: float
    total_pnl: float
    avg_pnl_per_trade: float
    total_target_dollars: float
    by_symbol: Dict[str, Dict[str, float]]
    cycles_completed: int
    trades_per_completed_cycle: float


def aggregate_metrics(trades: List[SimulatedTrade], cycles: List[List[SimulatedTrade]]) -> AggregateMetrics:
    n = len(trades)
    hits = sum(1 for t in trades if t.hit_target)
    pnl = sum(t.realized_dollars for t in trades)
    target = sum(t.target_dollars for t in trades)

    by_symbol: Dict[str, Dict[str, float]] = {}
    for t in trades:
        entry = by_symbol.setdefault(t.symbol, {"n": 0, "hits": 0, "pnl": 0.0})
        entry["n"] += 1
        entry["hits"] += int(t.hit_target)
        entry["pnl"] += t.realized_dollars

    for sym, e in by_symbol.items():
        e["hit_rate"] = e["hits"] / e["n"] if e["n"] else 0.0

    completed = [c for c in cycles if len(c) == 12]
    trades_per_completed = sum(len(c) for c in completed) / len(completed) if completed else 0.0

    return AggregateMetrics(
        n_trades=n,
        n_hits=hits,
        hit_rate=hits / n if n else 0.0,
        total_pnl=pnl,
        avg_pnl_per_trade=pnl / n if n else 0.0,
        total_target_dollars=target,
        by_symbol=by_symbol,
        cycles_completed=len(completed),
        trades_per_completed_cycle=trades_per_completed,
    )
