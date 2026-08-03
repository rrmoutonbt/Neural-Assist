"""Walk-forward backtest harness.

Given:
    - bars_by_symbol: {symbol: OHLCV DataFrame}
    - a scorer callable(symbol, side, history_df) -> (score_0_100, delta) or None
    - a simulator with .simulate(...)

For each symbol's history, walks forward one bar at a time (with a
configurable stride to reduce autocorrelation), asks the scorer for a
score, and — when score >= gate — hands the entry to the simulator.
Trades are respected by the 12-per-cycle rule: when a cycle fills, a
new one opens.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import pandas as pd

from .simulator import DeltaLinearSimulator, SimulatedTrade


ScorerFn = Callable[[str, str, pd.DataFrame], Optional[Tuple[float, float]]]
"""Signature: (symbol, side, history_df) -> (score, delta) | None"""


@dataclass
class BacktestConfig:
    per_option_target_dollars: float = 225.0
    gate: float = 90.0
    cycle_max_trades: int = 12
    max_hold_bars: int = 20
    entry_stride_bars: int = 1
    min_history_bars: int = 60
    contracts: int = 5
    dollars_per_point_map: Dict[str, float] = field(default_factory=dict)
    sides: Tuple[str, ...] = ("CALL", "PUT")
    default_dollars_per_point: float = 10.0


@dataclass
class Candidate:
    ts: pd.Timestamp
    symbol: str
    side: str
    score: float
    delta: float


@dataclass
class BacktestResult:
    trades: List[SimulatedTrade] = field(default_factory=list)
    considered: int = 0
    tradable: int = 0
    cycles: List[List[SimulatedTrade]] = field(default_factory=list)


class Backtester:
    def __init__(self, config: Optional[BacktestConfig] = None,
                 simulator: Optional[DeltaLinearSimulator] = None):
        self.config = config or BacktestConfig()
        self.simulator = simulator or DeltaLinearSimulator(
            per_option_target_dollars=self.config.per_option_target_dollars,
            max_hold_bars=self.config.max_hold_bars,
        )

    def run(
        self,
        bars_by_symbol: Dict[str, pd.DataFrame],
        scorer: ScorerFn,
    ) -> BacktestResult:
        result = BacktestResult(cycles=[[]])
        cfg = self.config
        events: List[Candidate] = []

        # 1) Collect scored candidates across the entire universe/history.
        for symbol, df in bars_by_symbol.items():
            n = len(df)
            for entry_idx in range(cfg.min_history_bars, n - 1, cfg.entry_stride_bars):
                history = df.iloc[: entry_idx + 1]
                for side in cfg.sides:
                    result.considered += 1
                    scored = scorer(symbol, side, history)
                    if scored is None:
                        continue
                    score, delta = scored
                    if score < cfg.gate:
                        continue
                    result.tradable += 1
                    events.append(Candidate(
                        ts=df.index[entry_idx], symbol=symbol,
                        side=side, score=score, delta=delta,
                    ))

        # 2) Chronological order — the bot only sees one signal at a time.
        events.sort(key=lambda c: (c.ts, -c.score))

        # 3) Iterate: at each event, simulate the trade. Respect 12/cycle.
        for cand in events:
            if len(result.cycles[-1]) >= cfg.cycle_max_trades:
                result.cycles.append([])

            df = bars_by_symbol[cand.symbol]
            entry_idx = df.index.get_indexer([cand.ts])[0]
            if entry_idx < 0:
                continue
            trade = self.simulator.simulate(
                df=df, entry_idx=int(entry_idx), symbol=cand.symbol,
                side=cand.side, contracts=cfg.contracts, delta=cand.delta,
                dollars_per_point=cfg.dollars_per_point_map.get(
                    cand.symbol, cfg.default_dollars_per_point,
                ),
            )
            if trade is None:
                continue
            result.trades.append(trade)
            result.cycles[-1].append(trade)

        return result
