"""Adapter that plugs an OptionChainProvider into LadderStrategy's
`option_context_provider` slot.

LadderStrategy calls:
    option_context_provider(symbol=..., side=..., df=...) -> dict

This module returns a callable with that signature, backed by a
ChainSnapshot from any OptionChainProvider implementation.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional, Sequence

import pandas as pd

from ladderbot.instruments import get as get_instrument

from .chain_provider import OptionChainProvider, pick_strike_by_delta


def chain_provider_to_option_context(
    provider: OptionChainProvider,
    target_delta: float = 0.38,
    default_dte: int = 45,
    iv_history_provider: Optional[Callable[[str], Sequence[float]]] = None,
) -> Callable[..., Dict[str, Any]]:
    """Wrap an OptionChainProvider so it can be passed to LadderStrategy.

    Usage:
        strategy = LadderStrategy({
            ...,
            "option_context_provider": chain_provider_to_option_context(
                provider=my_broker_chain_provider,
                target_delta=0.38,
            ),
        })
    """

    def _provider(symbol: str, side: str, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
        instrument = get_instrument(symbol)
        chain = provider.get_chain(symbol, target_dte=default_dte)
        if chain is None:
            return None
        option_type = "call" if side.upper() == "CALL" else "put"
        quote = pick_strike_by_delta(chain, target_delta=target_delta, option_type=option_type)
        if quote is None:
            return None

        premium_dollars = float(quote.mid) * instrument.dollars_per_point

        if iv_history_provider is not None:
            hist = list(iv_history_provider(symbol) or [])
            if hist:
                lo, hi = min(hist), max(hist)
                iv_rank = 0.5 if hi <= lo else max(0.0, min(1.0, ((quote.iv or lo) - lo) / (hi - lo)))
            else:
                iv_rank = 0.5
        else:
            iv_rank = 0.5

        return {
            "delta": float(abs(quote.delta or target_delta)),
            "iv_rank": float(iv_rank),
            "days_to_expiration": chain.days_to_expiration,
            "premium_points": float(quote.mid),
            "premium_dollars": float(premium_dollars),
            "dollars_per_point": instrument.dollars_per_point,
            "strike": float(quote.strike),
        }

    return _provider
