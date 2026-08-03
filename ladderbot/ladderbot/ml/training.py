"""Training loop, time-series CV, and monthly hit-count report.

The monthly report is the sanity check called out in the plan: our
calibrated model should reproduce the transcript's rough monthly
profile (Aug/Sep/Oct heaviest, Nov/Dec lightest).
"""

from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

import numpy as np
import pandas as pd

from .dataset import Sample
from .features import contexts_to_matrix
from .model import LadderClassifier, LadderClassifierConfig


@dataclass
class TrainingReport:
    n_train: int
    n_test: int
    base_rate: float
    test_accuracy: float
    test_brier: float
    test_auc: float
    monthly_hits: Dict[int, int] = field(default_factory=dict)
    fold_scores: List[float] = field(default_factory=list)


def _split(samples: Sequence[Sample], test_frac: float = 0.25) -> Tuple[List[Sample], List[Sample]]:
    ordered = sorted(samples, key=lambda s: s.ts)
    cut = int(len(ordered) * (1 - test_frac))
    return ordered[:cut], ordered[cut:]


def _xy(samples: Sequence[Sample]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    contexts = [s.context for s in samples]
    sides    = [s.side    for s in samples]
    labels   = np.array([s.label for s in samples], dtype=int)
    ts       = np.array([s.ts    for s in samples])
    X = contexts_to_matrix(contexts, sides)
    return X, labels, ts


def train_and_evaluate(
    samples: Sequence[Sample],
    config: LadderClassifierConfig = None,
    test_frac: float = 0.25,
    n_time_folds: int = 3,
    gate_score: float = 90.0,
) -> Tuple[LadderClassifier, TrainingReport]:
    from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
    from sklearn.model_selection import TimeSeriesSplit

    if len(samples) < 40:
        raise ValueError(f"need >= 40 samples, got {len(samples)}")

    train, test = _split(samples, test_frac=test_frac)
    X_train, y_train, ts_train = _xy(train)
    X_test,  y_test,  ts_test  = _xy(test)

    fold_scores: List[float] = []
    tss = TimeSeriesSplit(n_splits=n_time_folds)
    for tr_idx, va_idx in tss.split(X_train):
        if len(set(y_train[tr_idx])) < 2 or len(set(y_train[va_idx])) < 2:
            continue
        try:
            cv_model = LadderClassifier(config).fit(X_train[tr_idx], y_train[tr_idx])
            preds = cv_model.predict_proba(X_train[va_idx])
            fold_scores.append(float(roc_auc_score(y_train[va_idx], preds)))
        except ValueError:
            continue

    final = LadderClassifier(config).fit(X_train, y_train)
    test_proba = final.predict_proba(X_test)
    test_pred  = (final.score_batch(X_test) >= gate_score).astype(int)

    test_auc = float(roc_auc_score(y_test, test_proba)) if len(set(y_test.tolist())) > 1 else float("nan")
    test_brier_val = float(brier_score_loss(y_test, test_proba)) if len(y_test) > 0 else float("nan")
    report = TrainingReport(
        n_train=len(train),
        n_test=len(test),
        base_rate=float(y_train.mean()),
        test_accuracy=float(accuracy_score(y_test, test_pred)),
        test_brier=test_brier_val,
        test_auc=test_auc,
        monthly_hits=monthly_hit_report(test, final, gate_score=gate_score),
        fold_scores=fold_scores,
    )
    return final, report


def monthly_hit_report(
    samples: Sequence[Sample],
    model: LadderClassifier,
    gate_score: float = 90.0,
) -> Dict[int, int]:
    """Count how many samples score >= gate AND actually hit target, per month."""
    if not samples:
        return {}
    X, y, ts = _xy(samples)
    scores = model.score_batch(X)
    df = pd.DataFrame({"ts": pd.to_datetime(ts), "score": scores, "label": y})
    df["month"] = df["ts"].dt.month
    tradable = df[df["score"] >= gate_score]
    return tradable.groupby("month")["label"].sum().astype(int).to_dict()
