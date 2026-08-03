"""CalibratedLadderScorer: drop-in replacement for the Sprint 1 scorer.

Same public API as ladderbot.scorer.LadderScorer, but
its 0-100 score is a calibrated probability * 100 produced by a fitted
LadderClassifier. LadderStrategy accepts either scorer transparently
because both expose score_candidate() and rank().
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from .features import context_to_vector
from .model import LadderClassifier


LADDER_GATE = 90.0
MIN_DAYS_TO_EXPIRATION = 30


@dataclass
class LadderCandidate:
    symbol: str
    side: str
    score: float
    expected_dollars_per_hour: float
    features: Dict[str, float]
    reasons: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)

    @property
    def is_tradable(self) -> bool:
        return self.score >= LADDER_GATE


class CalibratedLadderScorer:
    def __init__(
        self,
        model: LadderClassifier,
        gate: float = LADDER_GATE,
        min_dte: int = MIN_DAYS_TO_EXPIRATION,
    ):
        self.model = model
        self.gate = gate
        self.min_dte = min_dte

    def score_candidate(
        self,
        symbol: str,
        side: str,
        ohlcv: pd.DataFrame,
        option_context: Dict[str, Any],
        dollar_target: float,
    ) -> Optional[LadderCandidate]:
        dte = option_context.get("days_to_expiration", 0)
        if dte < self.min_dte and not option_context.get("intraday_ok", False):
            return None

        vec = context_to_vector(option_context, side=side).reshape(1, -1)
        prob = float(self.model.predict_proba(vec)[0])
        score = round(100.0 * prob, 2)

        exp_dph = self._expected_dollars_per_hour(ohlcv, option_context, dollar_target)

        features = {name: float(v) for name, v in zip(
            ["delta", "iv_rank", "dte", "premium_dollars", "sr_clearance_atr",
             "seasonality", "fib_dead_zone_flag", "side_is_call",
             "premium_pct_of_1k", "dte_over_30"],
            vec.ravel().tolist(),
        )}
        return LadderCandidate(
            symbol=symbol, side=side, score=score,
            expected_dollars_per_hour=exp_dph, features=features,
        )

    def rank(self, candidates: List[LadderCandidate]) -> List[LadderCandidate]:
        tradable = [c for c in candidates if c.score >= self.gate]
        tradable.sort(key=lambda c: (c.score, c.expected_dollars_per_hour), reverse=True)
        return tradable

    @staticmethod
    def _expected_dollars_per_hour(df: pd.DataFrame, opt: Dict[str, Any], dollar_target: float) -> float:
        if "high" not in df or "low" not in df:
            return 0.0
        atr = (df["high"] - df["low"]).rolling(14).mean().iloc[-1]
        if not atr or atr <= 0:
            return 0.0
        est_hours = max(1.0, float(dollar_target / (atr * opt.get("dollars_per_point", 10) * 0.4)))
        return dollar_target / est_hours
