"""Smoke tests for the walk-forward validator + scorer adapter."""

import numpy as np
import pandas as pd
import pytest

from ladderbot.backtest import (
    BacktestConfig, WalkForwardConfig, WalkForwardValidator,
)
from ladderbot.bindings import mastery_scorer_to_fn


def _mixed_bars(days=600, seed=11, start=100.0):
    rng = np.random.default_rng(seed)
    r = np.empty(days)
    block = 30
    for i in range(0, days, block):
        drift = float(rng.choice([0.05, -0.05, 0.01, -0.01]))
        r[i:i+block] = rng.normal(drift, 0.012, min(block, days - i))
    close = start * np.exp(np.cumsum(r))
    high = close * (1 + rng.uniform(0, 0.006, days))
    low  = close * (1 - rng.uniform(0, 0.006, days))
    idx = pd.date_range("2024-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close,
                         "volume": rng.integers(500, 2000, days)}, index=idx)


def test_walkforward_generates_windows_and_reports():
    bars = {"CL": _mixed_bars(days=600, seed=3),
            "NQ": _mixed_bars(days=600, seed=17, start=200.0)}

    def train_fn(train_bars):
        def scorer(symbol, side, history):
            r = history["close"].pct_change().tail(10).mean()
            score = 95.0 if (side == "CALL" and r > 0) or (side == "PUT" and r < 0) else 40.0
            return (score, 0.38)
        return scorer

    cfg = WalkForwardConfig(
        train_window_days=180, test_window_days=60, step_days=90,
        min_train_bars=60,
        backtest_config=BacktestConfig(gate=90.0, contracts=5,
                                       entry_stride_bars=5, min_history_bars=30),
    )
    report = WalkForwardValidator(cfg).run(bars, train_fn)
    assert len(report.windows) >= 2
    for w in report.windows:
        assert w.test_start >= w.train_end
        assert 0.0 <= w.hit_rate <= 1.0
    assert 0.0 <= report.combined_hit_rate <= 1.0
    assert report.combined_profile is not None


def test_mastery_scorer_adapter_end_to_end():
    """The calibrated scorer plugs into the backtest ScorerFn signature."""
    from ladderbot.ml import (
        CalibratedLadderScorer, LabelingPolicy,
        LadderClassifier, build_dataset, train_and_evaluate,
    )
    from ladderbot.ml.model import LadderClassifierConfig

    bars = {"CL": _mixed_bars(days=400, seed=3),
            "NQ": _mixed_bars(days=400, seed=17, start=200.0)}

    def context_builder(symbol, side, df, entry_idx):
        return {"delta": 0.38, "iv_rank": 0.4, "days_to_expiration": 45,
                "premium_dollars": 800.0, "dollars_per_point": 10.0,
                "sr_clearance_atr": 3.0, "seasonality": 0.7,
                "fib_dead_zone": None}

    samples = build_dataset(bars, context_builder, sides=("CALL", "PUT"),
                            policy=LabelingPolicy(dollar_target=200.0, max_hold_days=20),
                            entry_stride=5, min_history=60)
    cfg = LadderClassifierConfig(n_estimators=40, max_depth=2, calibration_cv=2)
    model, _ = train_and_evaluate(samples, config=cfg)
    scorer = CalibratedLadderScorer(model, gate=50.0, min_dte=30)

    scorer_fn = mastery_scorer_to_fn(scorer, target_delta=0.38)
    # Drive at least one call to prove the adapter shape.
    out = scorer_fn("CL", "CALL", bars["CL"].tail(80))
    assert out is None or (isinstance(out, tuple) and len(out) == 2
                           and 0.0 <= out[0] <= 100.0)
