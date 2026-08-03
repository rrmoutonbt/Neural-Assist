"""LadderBot ML: calibrated classifier that replaces the Sprint 1
transparent-weights LadderScorer with a probability trained on
historical outcomes.

The output score is a calibrated probability in [0, 1] multiplied by
100 so it slots directly into the >= 90 gate LadderStrategy already
enforces.
"""

from .dataset import (
    LabelingPolicy,
    OutcomeLabeler,
    build_dataset,
    build_sample,
)
from .features import FEATURE_ORDER, context_to_vector, contexts_to_matrix
from .model import LadderClassifier
from .training import TrainingReport, train_and_evaluate, monthly_hit_report
from .scorer_adapter import CalibratedLadderScorer

__all__ = [
    "LabelingPolicy", "OutcomeLabeler", "build_dataset", "build_sample",
    "FEATURE_ORDER", "context_to_vector", "contexts_to_matrix",
    "LadderClassifier",
    "TrainingReport", "train_and_evaluate", "monthly_hit_report",
    "CalibratedLadderScorer",
]
