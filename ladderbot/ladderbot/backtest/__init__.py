"""LadderBot backtest harness.

Framework-free walk-forward backtester for the ladder methodology.
Does not depend on Bee_bot at runtime — scorers and outcome
simulators are supplied via callables/protocols so the harness can be
run against any implementation (transparent-weights scorer,
calibrated classifier, or the real LadderStrategy).

Public surface:
    - BarLoader.load_symbol / load_universe
    - DeltaLinearSimulator: outcome from delta-linear P&L on bars
    - Backtester + BacktestResult
    - monthly_hits, monthly_profile_comparison
    - aggregate_metrics: hit rate, PnL, per-symbol breakdown
    - TRANSCRIPT_PROFILE: the reference May=10 / June=12 / July=? shape
"""

from .loader import BarLoader
from .simulator import DeltaLinearSimulator, SimulatedTrade
from .harness import Backtester, BacktestConfig, BacktestResult, Candidate
from .report import (
    TRANSCRIPT_PROFILE,
    monthly_hits,
    monthly_profile_comparison,
    aggregate_metrics,
    ProfileComparison,
)
from .walkforward import (
    WalkForwardConfig, WalkForwardReport, WalkForwardValidator, WindowReport,
)

__all__ = [
    "BarLoader",
    "DeltaLinearSimulator", "SimulatedTrade",
    "Backtester", "BacktestConfig", "BacktestResult", "Candidate",
    "TRANSCRIPT_PROFILE",
    "monthly_hits", "monthly_profile_comparison", "aggregate_metrics",
    "ProfileComparison",
    "WalkForwardConfig", "WalkForwardReport", "WalkForwardValidator", "WindowReport",
]
