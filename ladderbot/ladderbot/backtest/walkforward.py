"""Walk-forward validator.

Splits the historical bar range into contiguous (train, test) windows,
lets a caller-supplied `train_fn(train_bars)` produce a scorer, then
runs the ladderbot.backtest.Backtester over `test_bars` with that scorer.
Aggregates monthly-hit + hit-rate metrics across windows so you can
compare model behavior across regimes without a single train/test
optimism bias.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional, Tuple

import pandas as pd

from .harness import Backtester, BacktestConfig, BacktestResult, ScorerFn
from .report import aggregate_metrics, monthly_profile_comparison, ProfileComparison
from .simulator import SimulatedTrade


TrainFn = Callable[[Dict[str, pd.DataFrame]], ScorerFn]
"""Signature: given train bars, return a fitted ScorerFn."""


@dataclass
class WalkForwardConfig:
    train_window_days: int = 180
    test_window_days: int = 60
    step_days: int = 60
    min_train_bars: int = 90
    backtest_config: BacktestConfig = field(default_factory=BacktestConfig)


@dataclass
class WindowReport:
    train_start: pd.Timestamp
    train_end:   pd.Timestamp
    test_start:  pd.Timestamp
    test_end:    pd.Timestamp
    n_trades: int
    n_hits: int
    hit_rate: float
    total_pnl: float
    profile: ProfileComparison


@dataclass
class WalkForwardReport:
    windows: List[WindowReport] = field(default_factory=list)
    all_trades: List[SimulatedTrade] = field(default_factory=list)
    combined_hit_rate: float = 0.0
    combined_pnl: float = 0.0
    combined_profile: Optional[ProfileComparison] = None


class WalkForwardValidator:
    def __init__(self, config: Optional[WalkForwardConfig] = None):
        self.config = config or WalkForwardConfig()

    def _windows(self, bars: Dict[str, pd.DataFrame]) -> List[Tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp, pd.Timestamp]]:
        starts = [df.index.min() for df in bars.values() if len(df)]
        ends   = [df.index.max() for df in bars.values() if len(df)]
        if not starts or not ends:
            return []
        t0 = max(starts)
        tN = min(ends)
        train_td = timedelta(days=self.config.train_window_days)
        test_td  = timedelta(days=self.config.test_window_days)
        step_td  = timedelta(days=self.config.step_days)

        wins = []
        cursor = t0
        while cursor + train_td + test_td <= tN + timedelta(days=1):
            train_start = cursor
            train_end   = cursor + train_td
            test_start  = train_end
            test_end    = test_start + test_td
            wins.append((train_start, train_end, test_start, test_end))
            cursor += step_td
        return wins

    def _slice(self, bars: Dict[str, pd.DataFrame], start: pd.Timestamp, end: pd.Timestamp) -> Dict[str, pd.DataFrame]:
        out: Dict[str, pd.DataFrame] = {}
        for sym, df in bars.items():
            sliced = df.loc[(df.index >= start) & (df.index < end)]
            if len(sliced) >= self.config.min_train_bars:
                out[sym] = sliced
        return out

    def run(self, bars: Dict[str, pd.DataFrame], train_fn: TrainFn) -> WalkForwardReport:
        report = WalkForwardReport()
        for ts, te, xs, xe in self._windows(bars):
            train_bars = self._slice(bars, ts, te)
            test_bars  = self._slice(bars, xs, xe)
            if not train_bars or not test_bars:
                continue
            scorer = train_fn(train_bars)
            bt = Backtester(config=self.config.backtest_config)
            result: BacktestResult = bt.run(test_bars, scorer)
            profile = monthly_profile_comparison(result.trades)
            metrics = aggregate_metrics(result.trades, result.cycles)
            report.windows.append(WindowReport(
                train_start=ts, train_end=te, test_start=xs, test_end=xe,
                n_trades=metrics.n_trades, n_hits=metrics.n_hits,
                hit_rate=metrics.hit_rate, total_pnl=metrics.total_pnl,
                profile=profile,
            ))
            report.all_trades.extend(result.trades)

        if report.all_trades:
            n = len(report.all_trades)
            hits = sum(1 for t in report.all_trades if t.hit_target)
            report.combined_hit_rate = hits / n
            report.combined_pnl = sum(t.realized_dollars for t in report.all_trades)
            report.combined_profile = monthly_profile_comparison(report.all_trades)

        return report
