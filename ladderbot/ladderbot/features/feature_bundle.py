"""Composes per-symbol features into the option_context dict LadderScorer expects.

Returned dict schema (subset — extra keys are harmless):
    delta                 float, absolute delta of the selected strike
    iv_rank               float in [0, 1]
    days_to_expiration    int
    premium_points        float, mid-price of the picked option in points
    premium_dollars       float, that mid-price converted to dollars
    dollars_per_point     float, tick multiplier for the underlying
    sr_clearance_atr      float, distance to next barrier in ATR
    fib_dead_zone         Optional[Tuple[float, str]]  see fibonacci.dead_zone_flag
    seasonality           float in [0, 1]

Attach the return value to bee_bot LadderStrategy config via
`option_context_provider=lambda symbol, side, df: build_option_context(...)`.
"""

from dataclasses import dataclass, asdict
from datetime import date, datetime
from typing import Any, Callable, Dict, Optional, Sequence

import pandas as pd

from .fibonacci import dead_zone_flag
from .option_chain import OptionChain, pick_strike_by_delta
from .seasonality import seasonality_score
from .support_resistance import clearance_in_atr, detect_levels, nearest_levels
from .volatility import atr, iv_rank


@dataclass
class FeatureBundle:
    delta: float
    iv_rank: float
    days_to_expiration: int
    premium_points: float
    premium_dollars: float
    dollars_per_point: float
    sr_clearance_atr: float
    fib_dead_zone: Optional[tuple]
    seasonality: float
    picked_strike: Optional[float] = None

    def to_option_context(self) -> Dict[str, Any]:
        d = asdict(self)
        d["fib_dead_zone"] = self.fib_dead_zone
        return d


def build_option_context(
    df: pd.DataFrame,
    chain: OptionChain,
    dollars_per_point: float,
    side: str = "CALL",
    target_delta: float = 0.38,
    iv_history: Optional[Sequence[float]] = None,
) -> Dict[str, Any]:
    """Assemble the LadderScorer-consumable context from raw inputs.

    Parameters
    ----------
    df : bar OHLCV history (index = timestamps).
    chain : loaded OptionChain with quotes for the target expiration.
    dollars_per_point : instrument tick multiplier (from Bee_bot instruments).
    side : "CALL" or "PUT".
    target_delta : target |delta| (0.30-0.45 fits the transcript's 0.38 example).
    iv_history : trailing ATM-IV series for IV-rank calc (falls back to 0.5).
    """
    chain.enrich_greeks()
    option_type = "call" if side.upper() == "CALL" else "put"
    quote = pick_strike_by_delta(chain, target_delta=target_delta, option_type=option_type)

    if quote is None:
        premium_dollars = 0.0
        picked_strike = None
        picked_delta = 0.0
    else:
        premium_dollars = quote.mid * dollars_per_point
        picked_strike = quote.strike
        picked_delta = float(abs(quote.delta or 0.0))

    premium_points = premium_dollars / dollars_per_point if dollars_per_point else 0.0

    atr_val = atr(df, period=14)
    levels = detect_levels(df)
    price = float(df["close"].iloc[-1])
    support, resistance = nearest_levels(price, levels)
    barrier = resistance if side.upper() == "CALL" else support
    sr_clearance = clearance_in_atr(price, barrier, atr_val)

    dead_zone = dead_zone_flag(df)

    now = df.index[-1] if hasattr(df.index[-1], "month") else pd.Timestamp(datetime.now())
    season = seasonality_score(df, pd.Timestamp(now))

    if iv_history and chain.atm_iv() is not None:
        rank = iv_rank(chain.atm_iv() or 0.0, iv_history)
        if rank != rank:
            rank = 0.5
    else:
        rank = 0.5

    bundle = FeatureBundle(
        delta=picked_delta,
        iv_rank=float(rank),
        days_to_expiration=chain.days_to_expiration,
        premium_points=float(premium_points),
        premium_dollars=float(premium_dollars),
        dollars_per_point=float(dollars_per_point),
        sr_clearance_atr=float(sr_clearance if sr_clearance != float("inf") else 5.0),
        fib_dead_zone=dead_zone,
        seasonality=float(season),
        picked_strike=picked_strike,
    )
    return bundle.to_option_context()


def make_provider(
    chain_loader: Callable[[str, str, pd.DataFrame], OptionChain],
    dollars_per_point_map: Dict[str, float],
    target_delta: float = 0.38,
    iv_history_provider: Optional[Callable[[str], Sequence[float]]] = None,
) -> Callable[..., Dict[str, Any]]:
    """Factory returning a LadderStrategy-compatible option_context_provider.

    Usage:
        provider = make_provider(chain_loader=..., dollars_per_point_map={"CL": 10, ...})
        LadderStrategy({..., "option_context_provider": provider})
    """
    def _provider(symbol: str, side: str, df: pd.DataFrame) -> Dict[str, Any]:
        chain = chain_loader(symbol, side, df)
        dpp = dollars_per_point_map.get(symbol, 0.0)
        history = iv_history_provider(symbol) if iv_history_provider else None
        return build_option_context(
            df=df, chain=chain, dollars_per_point=dpp,
            side=side, target_delta=target_delta, iv_history=history,
        )
    return _provider
