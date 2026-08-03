"""Convert option_context dicts into ordered numeric feature vectors.

Feature order is stable so serialized models remain valid across
processes/repos. Any missing key maps to 0.0.
"""

from typing import Any, Dict, List, Sequence

import numpy as np


FEATURE_ORDER: List[str] = [
    "delta",
    "iv_rank",
    "days_to_expiration",
    "premium_dollars",
    "sr_clearance_atr",
    "seasonality",
    "fib_dead_zone_flag",       # 1 if dead-zone present in favorable direction, else 0
    "side_is_call",             # 1 for CALL, 0 for PUT
    "premium_pct_of_1k",        # premium / 1000 (Juanita's $1k/option heuristic)
    "dte_over_30",              # max(0, dte - 30) / 60
]


def _dead_zone_flag(ctx: Dict[str, Any]) -> float:
    dz = ctx.get("fib_dead_zone")
    if not dz:
        return 0.0
    _, direction = dz
    side = str(ctx.get("side", "CALL")).upper()
    if side == "CALL" and direction == "reject_down":
        return 1.0
    if side == "PUT" and direction == "reject_up":
        return 1.0
    return 0.0


def context_to_vector(ctx: Dict[str, Any], side: str = "CALL") -> np.ndarray:
    ctx = {**ctx, "side": side}
    premium = float(ctx.get("premium_dollars", 0.0))
    dte = float(ctx.get("days_to_expiration", 0.0))
    return np.array([
        float(ctx.get("delta", 0.0)),
        float(ctx.get("iv_rank", 0.5)),
        dte,
        premium,
        float(ctx.get("sr_clearance_atr", 0.0)),
        float(ctx.get("seasonality", 0.5)),
        _dead_zone_flag(ctx),
        1.0 if side.upper() == "CALL" else 0.0,
        premium / 1000.0,
        max(0.0, dte - 30.0) / 60.0,
    ], dtype=float)


def contexts_to_matrix(contexts: Sequence[Dict[str, Any]], sides: Sequence[str]) -> np.ndarray:
    if len(contexts) != len(sides):
        raise ValueError("contexts and sides must be the same length")
    return np.vstack([context_to_vector(c, s) for c, s in zip(contexts, sides)])
