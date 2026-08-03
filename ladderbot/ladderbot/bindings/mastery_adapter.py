"""Adapter: turn a Mastery CalibratedLadderScorer into the ScorerFn
callable that ladderbot.backtest.Backtester expects.

ScorerFn signature:
    (symbol, side, history_df) -> (score_0_100, delta) | None

CalibratedLadderScorer.score_candidate signature:
    (symbol, side, ohlcv, option_context, dollar_target) -> LadderCandidate | None

We supply a synthetic option_context (delta target = configurable) so
the backtest can proceed without a real chain provider; the scorer's
final probability is a function of the context features + bar history
plus whatever the trained model has learned.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Tuple

import pandas as pd


def mastery_scorer_to_fn(
    scorer: Any,
    target_delta: float = 0.38,
    dollars_per_point: float = 10.0,
    iv_rank: float = 0.4,
    days_to_expiration: int = 45,
    premium_dollars: float = 800.0,
    dollar_target: float = 225.0,
    extra_context: Optional[Dict[str, Any]] = None,
) -> Callable[[str, str, pd.DataFrame], Optional[Tuple[float, float]]]:
    """Return a ScorerFn compatible with ladderbot.backtest.Backtester."""

    base_context = {
        "delta": target_delta,
        "iv_rank": iv_rank,
        "days_to_expiration": days_to_expiration,
        "premium_dollars": premium_dollars,
        "premium_points": premium_dollars / max(dollars_per_point, 1e-9),
        "dollars_per_point": dollars_per_point,
        "sr_clearance_atr": 3.0,
        "seasonality": 0.7,
        "fib_dead_zone": None,
    }
    if extra_context:
        base_context.update(extra_context)

    def _fn(symbol: str, side: str, history: pd.DataFrame) -> Optional[Tuple[float, float]]:
        cand = scorer.score_candidate(
            symbol=symbol, side=side, ohlcv=history,
            option_context=dict(base_context), dollar_target=dollar_target,
        )
        if cand is None:
            return None
        return float(cand.score), float(target_delta)

    return _fn
