"""LadderClassifier: GBDT + isotonic calibration.

Uses sklearn (already a Bee_bot dep) so no new packages required.
LightGBM/XGBoost are easy swap-ins later — subclass and override _make_base().
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np


@dataclass
class LadderClassifierConfig:
    n_estimators: int = 300
    max_depth: int = 3
    learning_rate: float = 0.05
    subsample: float = 0.85
    min_samples_leaf: int = 20
    random_state: int = 42
    calibration_method: str = "isotonic"    # "isotonic" | "sigmoid"
    calibration_cv: int = 3


class LadderClassifier:
    """GBDT wrapped in CalibratedClassifierCV.

    predict_proba returns calibrated P(target_hit); score() returns 0-100
    (probability * 100) so it slots into the LadderScorer >= 90 gate.
    """

    def __init__(self, config: Optional[LadderClassifierConfig] = None):
        self.config = config or LadderClassifierConfig()
        self._pipeline = None
        self._fitted = False

    def _make_base(self):
        from sklearn.ensemble import GradientBoostingClassifier
        c = self.config
        return GradientBoostingClassifier(
            n_estimators=c.n_estimators,
            max_depth=c.max_depth,
            learning_rate=c.learning_rate,
            subsample=c.subsample,
            min_samples_leaf=c.min_samples_leaf,
            random_state=c.random_state,
        )

    def fit(self, X: np.ndarray, y: np.ndarray) -> "LadderClassifier":
        from sklearn.calibration import CalibratedClassifierCV
        n_pos = int(np.sum(y == 1))
        n_neg = int(np.sum(y == 0))
        if n_pos == 0 or n_neg == 0:
            self._pipeline = _ConstantClassifier(constant=1.0 if n_neg == 0 else 0.0)
            self._fitted = True
            return self
        base = self._make_base()
        # CalibratedClassifierCV needs each internal fold to contain both classes.
        # Guarantee that by capping cv at min(n_pos, n_neg) and falling back to
        # the bare base estimator when even 2-fold is infeasible.
        cv = max(2, min(self.config.calibration_cv, n_pos, n_neg))
        if n_pos < cv or n_neg < cv or n_pos < 2 or n_neg < 2:
            base.fit(X, y)
            self._pipeline = base
        else:
            self._pipeline = CalibratedClassifierCV(
                base, method=self.config.calibration_method, cv=cv
            )
            self._pipeline.fit(X, y)
        self._fitted = True
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        if not self._fitted:
            raise RuntimeError("call fit() before predict_proba()")
        return self._pipeline.predict_proba(X)[:, 1]

    def score_batch(self, X: np.ndarray) -> np.ndarray:
        return 100.0 * self.predict_proba(X)

    def save(self, path: str) -> None:
        import joblib
        joblib.dump({"pipeline": self._pipeline, "config": self.config}, path)

    @classmethod
    def load(cls, path: str) -> "LadderClassifier":
        import joblib
        blob = joblib.load(path)
        inst = cls(config=blob["config"])
        inst._pipeline = blob["pipeline"]
        inst._fitted = True
        return inst


class _ConstantClassifier:
    """Degenerate classifier used when training data has only one class."""

    def __init__(self, constant: float = 0.0):
        self.constant = float(constant)

    def fit(self, X, y):
        return self

    def predict_proba(self, X):
        n = len(X)
        p_pos = self.constant
        return np.column_stack([np.full(n, 1.0 - p_pos), np.full(n, p_pos)])
