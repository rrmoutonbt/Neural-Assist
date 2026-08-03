"""LadderBot: futures-options strategy adapted from the Ms. Juanita "Ladder" method.

Public surface:
    - INSTRUMENTS: futures tick / dollar-per-point table
    - TraceSlip: per-trade record (bid/ask/last/fill/dollar totals)
    - LadderScorer: 0-100 probability from a bundle of confluence features
    - LadderStrategy: TradingStrategy subclass gated at score >= 90
    - CycleGovernor: hard 12-trade cycle with kill-switch
"""

from ladderbot.instruments import INSTRUMENTS, Instrument
from ladderbot.trace_slip import TraceSlip
from ladderbot.scorer import LadderScorer, LadderCandidate
from ladderbot.cycle import CycleGovernor, CycleState
from ladderbot.strategy import LadderStrategy

__all__ = [
    "INSTRUMENTS",
    "Instrument",
    "TraceSlip",
    "LadderScorer",
    "LadderCandidate",
    "CycleGovernor",
    "CycleState",
    "LadderStrategy",
]
