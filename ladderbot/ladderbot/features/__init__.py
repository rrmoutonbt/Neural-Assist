"""Futures feature pipeline for the LadderBot strategy.

Produces the exact option_context dict that
ladderbot.scorer.LadderScorer consumes, so the two
repos stay in lockstep without a hard cross-repo import.
"""

from .support_resistance import (
    swing_pivots,
    cluster_levels,
    nearest_levels,
    clearance_in_atr,
)
from .fibonacci import fib_levels, nearest_fib, dead_zone_flag
from .volatility import atr, realized_vol, atr_percentile, iv_rank
from .greeks import bs_greeks, bs_price, implied_volatility
from .option_chain import OptionQuote, OptionChain, pick_strike_by_delta
from .seasonality import monthly_edge, dow_edge, seasonality_score
from .feature_bundle import build_option_context, FeatureBundle

__all__ = [
    "swing_pivots", "cluster_levels", "nearest_levels", "clearance_in_atr",
    "fib_levels", "nearest_fib", "dead_zone_flag",
    "atr", "realized_vol", "atr_percentile", "iv_rank",
    "bs_greeks", "bs_price", "implied_volatility",
    "OptionQuote", "OptionChain", "pick_strike_by_delta",
    "monthly_edge", "dow_edge", "seasonality_score",
    "build_option_context", "FeatureBundle",
]
