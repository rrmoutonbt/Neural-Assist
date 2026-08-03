"""Smoke tests for the ladderbot.ml package (Sprint 3)."""

import numpy as np
import pandas as pd
import pytest

from ladderbot.ml import (
    CalibratedLadderScorer,
    FEATURE_ORDER,
    LabelingPolicy,
    LadderClassifier,
    OutcomeLabeler,
    build_dataset,
    context_to_vector,
    contexts_to_matrix,
    monthly_hit_report,
    train_and_evaluate,
)
from ladderbot.ml.model import LadderClassifierConfig


def _bars(days=400, drift=0.0006, vol=0.012, seed=11, start=100.0):
    rng = np.random.default_rng(seed)
    r = rng.normal(drift, vol, days)
    close = start * np.exp(np.cumsum(r))
    high = close * (1 + rng.uniform(0, 0.006, days))
    low  = close * (1 - rng.uniform(0, 0.006, days))
    idx = pd.date_range("2024-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close,
                         "volume": rng.integers(500, 2000, days)}, index=idx)


def _mixed_bars(days=400, seed=11, start=100.0):
    """Alternating trend regimes so labels aren't all zero."""
    rng = np.random.default_rng(seed)
    r = np.empty(days)
    block = 30
    for i in range(0, days, block):
        drift = float(rng.choice([0.05, -0.05, 0.01, -0.01]))
        vol = float(rng.uniform(0.008, 0.015))
        r[i:i+block] = rng.normal(drift, vol, min(block, days - i))
    close = start * np.exp(np.cumsum(r))
    high = close * (1 + rng.uniform(0, 0.006, days))
    low  = close * (1 - rng.uniform(0, 0.006, days))
    idx = pd.date_range("2024-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close,
                         "volume": rng.integers(500, 2000, days)}, index=idx)


def _synth_context(symbol, side, df, entry_idx):
    rng = np.random.default_rng(hash((symbol, side, entry_idx)) & 0xFFFF)
    close = df["close"].iloc[-1]
    high = df["high"].tail(20).max()
    low  = df["low"].tail(20).min()
    return {
        "delta": 0.38,
        "iv_rank": float(rng.uniform(0.1, 0.9)),
        "days_to_expiration": int(rng.integers(30, 90)),
        "premium_dollars": float(rng.uniform(500, 1200)),
        "dollars_per_point": 10.0,
        "sr_clearance_atr": float(abs(high - close) / max(1e-6, (high - low) / 20)),
        "seasonality": float(rng.uniform(0.3, 0.9)),
        "fib_dead_zone": None,
    }


def test_feature_vector_shape_and_flags():
    ctx = {"delta": 0.4, "iv_rank": 0.3, "days_to_expiration": 45,
           "premium_dollars": 800, "sr_clearance_atr": 2.1, "seasonality": 0.7,
           "fib_dead_zone": (0.618, "reject_down")}
    v = context_to_vector(ctx, side="CALL")
    assert v.shape == (len(FEATURE_ORDER),)
    assert v[FEATURE_ORDER.index("side_is_call")] == 1.0
    assert v[FEATURE_ORDER.index("fib_dead_zone_flag")] == 1.0
    assert v[FEATURE_ORDER.index("premium_pct_of_1k")] == pytest.approx(0.8)


def test_outcome_labeler_hits_target_when_price_moves_enough():
    df = _bars(days=60, drift=0.05, vol=0.005, seed=7)  # strong uptrend
    labeler = OutcomeLabeler(LabelingPolicy(dollar_target=225.0, max_hold_days=20))
    label, hold, mf, ma = labeler.label(df, entry_idx=10, side="CALL",
                                        delta=0.38, dollars_per_point=10.0)
    assert label == 1
    assert hold is not None and 1 <= hold <= 20
    assert mf >= 225.0


def test_outcome_labeler_misses_when_flat():
    df = _bars(days=60, drift=0.0, vol=0.0005, seed=7)
    labeler = OutcomeLabeler(LabelingPolicy(dollar_target=225.0, max_hold_days=20))
    label, hold, mf, ma = labeler.label(df, entry_idx=10, side="CALL",
                                        delta=0.38, dollars_per_point=10.0)
    assert label == 0
    assert hold is None


def test_build_dataset_produces_samples():
    bars = {"CL": _bars(days=200)}
    samples = build_dataset(bars, _synth_context, sides=("CALL", "PUT"),
                            policy=LabelingPolicy(dollar_target=200.0, max_hold_days=15),
                            min_history=60, entry_stride=5)
    assert len(samples) > 20
    labels = [s.label for s in samples]
    assert set(labels).issubset({0, 1})


def test_ladder_classifier_end_to_end_and_scorer_adapter():
    bars = {"CL": _mixed_bars(days=400, seed=3),
            "NQ": _mixed_bars(days=400, seed=17, start=200.0)}
    samples = build_dataset(bars, _synth_context, sides=("CALL", "PUT"),
                            policy=LabelingPolicy(dollar_target=200.0, max_hold_days=20),
                            entry_stride=3)
    assert len(samples) > 100

    cfg = LadderClassifierConfig(n_estimators=80, max_depth=2, calibration_cv=3)
    model, report = train_and_evaluate(samples, config=cfg, test_frac=0.25, n_time_folds=3)
    assert report.n_train > 0 and report.n_test > 0
    assert 0.0 <= report.test_accuracy <= 1.0
    assert 0.0 <= report.test_brier <= 1.0

    # Drop-in scorer: uses same score_candidate signature as Sprint 1
    scorer = CalibratedLadderScorer(model, gate=90.0, min_dte=30)
    df = bars["CL"]
    ctx = _synth_context("CL", "CALL", df, len(df) - 1)
    cand = scorer.score_candidate(symbol="CL", side="CALL", ohlcv=df,
                                  option_context=ctx, dollar_target=225.0)
    assert cand is not None
    assert 0.0 <= cand.score <= 100.0
    assert cand.is_tradable == (cand.score >= 90.0)


def test_scorer_adapter_rejects_short_dte():
    bars = {"CL": _mixed_bars(days=300, seed=8)}
    samples = build_dataset(bars, _synth_context, sides=("CALL", "PUT"),
                            policy=LabelingPolicy(dollar_target=200.0, max_hold_days=20),
                            entry_stride=3)
    cfg = LadderClassifierConfig(n_estimators=60, max_depth=2, calibration_cv=2)
    model, _ = train_and_evaluate(samples, config=cfg)
    scorer = CalibratedLadderScorer(model, gate=90.0, min_dte=30)
    ctx = _synth_context("CL", "CALL", bars["CL"], len(bars["CL"]) - 1)
    ctx["days_to_expiration"] = 10
    cand = scorer.score_candidate(symbol="CL", side="CALL", ohlcv=bars["CL"],
                                  option_context=ctx, dollar_target=225.0)
    assert cand is None


def test_monthly_hit_report_returns_dict():
    bars = {"CL": _mixed_bars(days=400, seed=5)}
    samples = build_dataset(bars, _synth_context, sides=("CALL", "PUT"),
                            policy=LabelingPolicy(dollar_target=200.0, max_hold_days=20),
                            entry_stride=3)
    cfg = LadderClassifierConfig(n_estimators=60, max_depth=2, calibration_cv=2)
    model, _ = train_and_evaluate(samples, config=cfg)
    report = monthly_hit_report(samples[-40:], model, gate_score=50.0)
    assert isinstance(report, dict)
    for k, v in report.items():
        assert 1 <= k <= 12
        assert v >= 0
