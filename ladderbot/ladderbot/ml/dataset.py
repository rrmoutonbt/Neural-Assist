"""Dataset builder: bars + option_context stream -> (X, y, ts).

Labeling policy mirrors Ms. Juanita's rule of thumb:
  - Target hit: the option's premium moves by >= dollar_target within
    max_hold_days.
  - No stop (per the transcript, no stop-loss is used) but we
    optionally track "adverse move exceeds premium" as a hard fail.

Because a full backtester over real option chains is out of scope for
Sprint 3, we approximate the option-P&L trajectory using delta as a
locally-linear proxy:
      option_pnl_dollars(t) = delta * (S_t - S_0) * dollars_per_point
Sprint 4/7 will replace this with mark-to-market from historical chains.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd


@dataclass
class LabelingPolicy:
    dollar_target: float = 225.0
    max_hold_days: int = 20
    max_adverse_dollars: Optional[float] = None   # None = no hard stop (Juanita's default)
    use_delta_proxy: bool = True


@dataclass
class Sample:
    ts: pd.Timestamp
    symbol: str
    side: str
    context: Dict[str, Any]
    label: int                     # 1 if target hit, 0 otherwise
    hold_days: Optional[int]       # None if never reached
    max_favorable: float
    max_adverse: float


class OutcomeLabeler:
    """Given a bar history and an entry index, decide the trade outcome."""

    def __init__(self, policy: LabelingPolicy):
        self.policy = policy

    def label(
        self,
        df: pd.DataFrame,
        entry_idx: int,
        side: str,
        delta: float,
        dollars_per_point: float,
    ) -> Tuple[int, Optional[int], float, float]:
        if entry_idx >= len(df) - 1:
            return 0, None, 0.0, 0.0
        p = self.policy
        end = min(len(df), entry_idx + 1 + p.max_hold_days)
        entry_price = float(df["close"].iloc[entry_idx])
        sign = 1 if side.upper() == "CALL" else -1
        target = p.dollar_target
        max_fav = 0.0
        max_adv = 0.0
        hit_day: Optional[int] = None

        for step, i in enumerate(range(entry_idx + 1, end), start=1):
            move = float(df["close"].iloc[i]) - entry_price
            if p.use_delta_proxy:
                pnl = sign * delta * move * dollars_per_point
            else:
                pnl = sign * move * dollars_per_point
            max_fav = max(max_fav, pnl)
            max_adv = min(max_adv, pnl)

            if p.max_adverse_dollars is not None and pnl <= -abs(p.max_adverse_dollars):
                return 0, step, max_fav, max_adv

            if pnl >= target and hit_day is None:
                hit_day = step
                return 1, hit_day, max_fav, max_adv

        return 0, None, max_fav, max_adv


def build_sample(
    ts: pd.Timestamp,
    symbol: str,
    side: str,
    context: Dict[str, Any],
    df: pd.DataFrame,
    entry_idx: int,
    policy: LabelingPolicy,
) -> Sample:
    labeler = OutcomeLabeler(policy)
    label, hold_days, mf, ma = labeler.label(
        df=df,
        entry_idx=entry_idx,
        side=side,
        delta=float(context.get("delta", 0.38)),
        dollars_per_point=float(context.get("dollars_per_point", 10.0)),
    )
    return Sample(ts=ts, symbol=symbol, side=side, context=context,
                  label=label, hold_days=hold_days,
                  max_favorable=mf, max_adverse=ma)


def build_dataset(
    bars_by_symbol: Dict[str, pd.DataFrame],
    context_builder: Callable[[str, str, pd.DataFrame, int], Dict[str, Any]],
    sides: Sequence[str] = ("CALL", "PUT"),
    policy: Optional[LabelingPolicy] = None,
    min_history: int = 60,
    entry_stride: int = 5,
) -> List[Sample]:
    """Walk each symbol's bars, build one Sample per entry candidate.

    context_builder: callable(symbol, side, df, entry_idx) -> option_context dict.
                     Sprint 2's build_option_context can be adapted here.
    entry_stride: skip N bars between candidates to reduce autocorrelation.
    """
    policy = policy or LabelingPolicy()
    samples: List[Sample] = []
    for symbol, df in bars_by_symbol.items():
        n = len(df)
        for entry_idx in range(min_history, n - 1, entry_stride):
            ts = df.index[entry_idx]
            history = df.iloc[: entry_idx + 1]
            for side in sides:
                try:
                    ctx = context_builder(symbol, side, history, entry_idx)
                except Exception:
                    continue
                if ctx is None:
                    continue
                samples.append(build_sample(
                    ts=ts, symbol=symbol, side=side, context=ctx,
                    df=df, entry_idx=entry_idx, policy=policy,
                ))
    return samples
