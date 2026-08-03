"""Minimal strategy-framework primitives.

Previously imported from bee_bot.strategies.base. Copied here so
LadderBot has zero runtime dependency on the Bee_bot source tree.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import pandas as pd


class StrategySignal(Enum):
    STRONG_BUY = "STRONG_BUY"
    BUY = "BUY"
    WEAK_BUY = "WEAK_BUY"
    HOLD = "HOLD"
    WEAK_SELL = "WEAK_SELL"
    SELL = "SELL"
    STRONG_SELL = "STRONG_SELL"


@dataclass
class TradingSignal:
    symbol: str
    signal: StrategySignal
    confidence: float
    strength: float
    urgency: float
    target_weight: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    holding_period: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)


class TradingStrategy(ABC):
    """Abstract base every LadderBot strategy inherits.

    Kept minimal: LadderBot ships one strategy (LadderStrategy). The
    framework only requires generate_signals + update_positions.
    """

    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.enabled = config.get("enabled", True)

    @abstractmethod
    def generate_signals(
        self, market_data: Dict[str, pd.DataFrame], universe: List[str],
    ) -> List[TradingSignal]: ...

    @abstractmethod
    def update_positions(
        self, current_positions: Dict[str, float],
        new_signals: List[TradingSignal],
    ) -> Dict[str, float]: ...
