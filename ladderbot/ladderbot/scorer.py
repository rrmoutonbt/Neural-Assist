"""LadderScorer: 0-100 probability score with confluence gating.

Faithful mirror of Ms. Juanita's "ladder" concept: a scored, ranked
list of candidate trades. Only setups scoring >= 90 are tradable; ties
are broken by expected $ per hour.

The scorer is a transparent weighted-features model as a v1 baseline;
Module F (backtest harness, later sprint) will replace weights with a
calibrated gradient-boosted classifier trained on historical outcomes.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any

import numpy as np
import pandas as pd


LADDER_GATE = 90.0
MIN_DAYS_TO_EXPIRATION = 30


@dataclass
class LadderCandidate:
    symbol: str
    side: str                       # "CALL" | "PUT"
    score: float                    # 0-100
    expected_dollars_per_hour: float
    features: Dict[str, float]
    reasons: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)

    @property
    def is_tradable(self) -> bool:
        return self.score >= LADDER_GATE


DEFAULT_WEIGHTS: Dict[str, float] = {
    "trend_alignment":       18.0,
    "sr_clearance":          16.0,
    "fib_confluence":        10.0,
    "momentum":              12.0,
    "volatility_regime":     10.0,
    "delta_fit":              8.0,
    "iv_rank_fit":            8.0,
    "seasonality":            6.0,
    "volume_confirmation":    6.0,
    "dte_buffer":             6.0,
}


class LadderScorer:
    """Weighted confluence scorer producing a 0-100 ladder score.

    All feature functions return values normalized to [0, 1] so weights
    are directly interpretable as percentage points of the final score.
    """

    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = weights or DEFAULT_WEIGHTS
        total = sum(self.weights.values())
        if not (99.0 <= total <= 101.0):
            raise ValueError(f"Ladder weights must sum to ~100, got {total}")

    def score_candidate(
        self,
        symbol: str,
        side: str,
        ohlcv: pd.DataFrame,
        option_context: Dict[str, Any],
        dollar_target: float,
    ) -> Optional[LadderCandidate]:
        if len(ohlcv) < 60:
            return None

        dte = option_context.get("days_to_expiration", 0)
        if dte < MIN_DAYS_TO_EXPIRATION and not option_context.get("intraday_ok", False):
            return None

        features = self._features(side, ohlcv, option_context)
        score = sum(self.weights[k] * features.get(k, 0.0) for k in self.weights)

        reasons = [
            f"{k}={v:.2f}"
            for k, v in sorted(features.items(), key=lambda kv: -kv[1])
        ]

        exp_dph = self._expected_dollars_per_hour(ohlcv, option_context, dollar_target)

        return LadderCandidate(
            symbol=symbol,
            side=side,
            score=round(score, 2),
            expected_dollars_per_hour=exp_dph,
            features=features,
            reasons=reasons,
        )

    def rank(self, candidates: List[LadderCandidate]) -> List[LadderCandidate]:
        tradable = [c for c in candidates if c.is_tradable]
        tradable.sort(key=lambda c: (c.score, c.expected_dollars_per_hour), reverse=True)
        return tradable

    def _features(
        self, side: str, df: pd.DataFrame, opt: Dict[str, Any]
    ) -> Dict[str, float]:
        close = df["close"]
        high = df.get("high", close)
        low = df.get("low", close)
        vol = df.get("volume", pd.Series(np.ones(len(df)), index=df.index))

        ema20 = close.ewm(span=20).mean()
        ema50 = close.ewm(span=50).mean()
        atr = (high - low).rolling(14).mean().iloc[-1]
        last = close.iloc[-1]

        trend_up = ema20.iloc[-1] > ema50.iloc[-1]
        trend_alignment = 1.0 if (side == "CALL") == trend_up else 0.0

        sr = self._support_resistance(close)
        clearance_pts = (sr["next_resistance"] - last) if side == "CALL" else (last - sr["next_support"])
        sr_clearance = float(np.clip((clearance_pts / atr) / 3.0, 0.0, 1.0)) if atr > 0 else 0.0

        fib = self._fib_levels(close)
        fib_dist = min(abs(last - lvl) for lvl in fib.values())
        fib_confluence = float(np.clip(1.0 - (fib_dist / atr), 0.0, 1.0)) if atr > 0 else 0.0

        rsi = self._rsi(close, 14)
        momentum = float(np.clip((rsi - 50) / 30.0, 0.0, 1.0)) if side == "CALL" \
                   else float(np.clip((50 - rsi) / 30.0, 0.0, 1.0))

        realized_vol = close.pct_change().rolling(20).std().iloc[-1] * np.sqrt(252)
        volatility_regime = float(np.clip(1.0 - abs(realized_vol - 0.25) / 0.25, 0.0, 1.0))

        delta = abs(opt.get("delta", 0.0))
        delta_fit = float(np.clip(1.0 - abs(delta - 0.38) / 0.20, 0.0, 1.0))

        iv_rank = opt.get("iv_rank", 0.5)
        iv_rank_fit = float(np.clip(1.0 - abs(iv_rank - 0.4) / 0.4, 0.0, 1.0))

        month = datetime.now().month
        seasonality_map = {8: 1.0, 9: 1.0, 10: 0.9, 5: 0.8, 6: 0.85, 7: 0.75,
                           1: 0.6, 2: 0.6, 3: 0.65, 4: 0.7, 11: 0.55, 12: 0.4}
        seasonality = seasonality_map.get(month, 0.6)

        recent_vol = vol.tail(5).mean()
        base_vol = vol.tail(30).mean()
        volume_confirmation = float(np.clip(recent_vol / base_vol - 0.5, 0.0, 1.0)) if base_vol > 0 else 0.0

        dte = opt.get("days_to_expiration", 0)
        dte_buffer = float(np.clip((dte - MIN_DAYS_TO_EXPIRATION) / 60.0, 0.0, 1.0))

        return {
            "trend_alignment": trend_alignment,
            "sr_clearance": sr_clearance,
            "fib_confluence": fib_confluence,
            "momentum": momentum,
            "volatility_regime": volatility_regime,
            "delta_fit": delta_fit,
            "iv_rank_fit": iv_rank_fit,
            "seasonality": seasonality,
            "volume_confirmation": volume_confirmation,
            "dte_buffer": dte_buffer,
        }

    @staticmethod
    def _support_resistance(close: pd.Series, window: int = 40) -> Dict[str, float]:
        recent = close.tail(window)
        last = close.iloc[-1]
        resistances = recent[recent > last]
        supports = recent[recent < last]
        return {
            "next_resistance": float(resistances.min()) if len(resistances) else float(last * 1.05),
            "next_support":    float(supports.max())    if len(supports)    else float(last * 0.95),
        }

    @staticmethod
    def _fib_levels(close: pd.Series, window: int = 60) -> Dict[str, float]:
        recent = close.tail(window)
        hi, lo = float(recent.max()), float(recent.min())
        rng = hi - lo
        return {
            "0.236": lo + rng * 0.236,
            "0.382": lo + rng * 0.382,
            "0.500": lo + rng * 0.500,
            "0.618": lo + rng * 0.618,
            "0.786": lo + rng * 0.786,
        }

    @staticmethod
    def _rsi(close: pd.Series, period: int = 14) -> float:
        delta = close.diff().dropna()
        gain = delta.clip(lower=0).rolling(period).mean()
        loss = (-delta.clip(upper=0)).rolling(period).mean()
        rs = gain / loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))
        val = rsi.iloc[-1]
        return float(val) if not np.isnan(val) else 50.0

    @staticmethod
    def _expected_dollars_per_hour(
        df: pd.DataFrame, opt: Dict[str, Any], dollar_target: float
    ) -> float:
        atr = (df["high"] - df["low"]).rolling(14).mean().iloc[-1] if "high" in df else 0.0
        if not atr or atr <= 0:
            return 0.0
        est_hours = max(1.0, float(dollar_target / (atr * opt.get("dollars_per_point", 10) * 0.4)))
        return dollar_target / est_hours
