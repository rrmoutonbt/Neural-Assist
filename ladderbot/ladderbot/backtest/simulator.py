"""DeltaLinearSimulator: outcome from a delta-linear P&L proxy.

Matches the labeling model used in ladderbot.ml.dataset for
consistency: option premium moves linearly with delta * (S_t - S_0)
* dollars_per_point. Fast, deterministic, good enough for walk-forward
strategy evaluation. Sprint 8 will substitute a mark-to-market
simulator once real option chain history is wired.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import pandas as pd


@dataclass
class SimulatedTrade:
    symbol: str
    side: str                       # "CALL" | "PUT"
    entered_at: datetime
    exit_at: Optional[datetime]
    hold_bars: int
    contracts: int
    target_dollars: float
    realized_dollars: float
    max_favorable: float
    max_adverse: float
    hit_target: bool
    delta: float


@dataclass
class DeltaLinearSimulator:
    per_option_target_dollars: float = 225.0
    max_hold_bars: int = 20
    dollars_per_point_default: float = 10.0

    def simulate(
        self,
        df: pd.DataFrame,
        entry_idx: int,
        symbol: str,
        side: str,
        contracts: int,
        delta: float,
        dollars_per_point: Optional[float] = None,
    ) -> Optional[SimulatedTrade]:
        if entry_idx >= len(df) - 1 or contracts <= 0:
            return None
        dpp = dollars_per_point if dollars_per_point is not None else self.dollars_per_point_default
        sign = 1 if side.upper() == "CALL" else -1
        entered_at = df.index[entry_idx]
        entry_price = float(df["close"].iloc[entry_idx])
        per_option_target = self.per_option_target_dollars

        max_fav = 0.0
        max_adv = 0.0
        hit_at: Optional[int] = None
        end = min(len(df), entry_idx + 1 + self.max_hold_bars)

        for step, i in enumerate(range(entry_idx + 1, end), start=1):
            move = float(df["close"].iloc[i]) - entry_price
            pnl_per_contract = sign * delta * move * dpp
            max_fav = max(max_fav, pnl_per_contract)
            max_adv = min(max_adv, pnl_per_contract)
            if pnl_per_contract >= per_option_target and hit_at is None:
                hit_at = step
                realized = per_option_target * contracts
                return SimulatedTrade(
                    symbol=symbol, side=side, entered_at=entered_at,
                    exit_at=df.index[i], hold_bars=step, contracts=contracts,
                    target_dollars=per_option_target * contracts,
                    realized_dollars=realized,
                    max_favorable=max_fav * contracts,
                    max_adverse=max_adv * contracts,
                    hit_target=True, delta=delta,
                )
        # Never hit — close at end-of-window mid, book unrealized as realized.
        last_i = end - 1
        final_move = float(df["close"].iloc[last_i]) - entry_price
        final_pnl_per_contract = sign * delta * final_move * dpp
        return SimulatedTrade(
            symbol=symbol, side=side, entered_at=entered_at,
            exit_at=df.index[last_i], hold_bars=end - entry_idx - 1,
            contracts=contracts,
            target_dollars=per_option_target * contracts,
            realized_dollars=final_pnl_per_contract * contracts,
            max_favorable=max_fav * contracts,
            max_adverse=max_adv * contracts,
            hit_target=False, delta=delta,
        )
