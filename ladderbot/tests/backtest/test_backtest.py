"""Smoke tests for the LadderBot backtest harness (Sprint 7)."""

import os
import sys
import tempfile

import numpy as np
import pandas as pd
import pytest

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..",
                                       "backend-trading-service"))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from ladderbot.backtest import (  # noqa: E402
    Backtester, BacktestConfig, BarLoader, DeltaLinearSimulator,
    TRANSCRIPT_PROFILE, aggregate_metrics, monthly_hits,
    monthly_profile_comparison,
)


def _bars(days=200, drift=0.001, vol=0.01, seed=7, start=100.0):
    rng = np.random.default_rng(seed)
    r = rng.normal(drift, vol, days)
    close = start * np.exp(np.cumsum(r))
    high = close * (1 + rng.uniform(0, 0.005, days))
    low  = close * (1 - rng.uniform(0, 0.005, days))
    idx = pd.date_range("2025-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close,
                         "volume": rng.integers(500, 2000, days)}, index=idx)


def _mixed_bars(days=400, seed=11, start=100.0):
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


# ----- loader --------------------------------------------------------------

def test_bar_loader_reads_csv_with_date_or_timestamp():
    with tempfile.TemporaryDirectory() as d:
        df = _bars(days=30)
        # write with "date" column
        df.to_csv(os.path.join(d, "CL.csv"), index_label="date")
        # write another with "timestamp"
        df2 = _bars(days=20, seed=3)
        df2.to_csv(os.path.join(d, "NQ.csv"), index_label="timestamp")

        loader = BarLoader(root=d)
        assert set(loader.available_symbols()) == {"CL", "NQ"}
        loaded = loader.load_universe(["CL", "NQ", "MISSING"])
        assert set(loaded.keys()) == {"CL", "NQ"}
        assert len(loaded["CL"]) == 30
        assert list(loaded["CL"].columns) == ["open", "high", "low", "close", "volume"]


def test_bar_loader_missing_columns_raises():
    with tempfile.TemporaryDirectory() as d:
        pd.DataFrame({"date": ["2024-01-01"], "close": [100.0]}).to_csv(
            os.path.join(d, "X.csv"), index=False,
        )
        with pytest.raises(ValueError, match="missing columns"):
            BarLoader(root=d).load_symbol("X")


# ----- simulator -----------------------------------------------------------

def test_simulator_hits_target_on_strong_uptrend():
    df = _bars(days=60, drift=0.05, vol=0.003, seed=2)
    sim = DeltaLinearSimulator(per_option_target_dollars=225.0, max_hold_bars=20)
    trade = sim.simulate(df, entry_idx=5, symbol="CL", side="CALL",
                         contracts=5, delta=0.38, dollars_per_point=10.0)
    assert trade is not None
    assert trade.hit_target
    assert trade.realized_dollars == pytest.approx(225.0 * 5)
    assert trade.hold_bars <= 20


def test_simulator_misses_on_flat_market():
    df = _bars(days=60, drift=0.0, vol=0.0005, seed=2)
    sim = DeltaLinearSimulator(per_option_target_dollars=225.0, max_hold_bars=20)
    trade = sim.simulate(df, entry_idx=5, symbol="CL", side="CALL",
                         contracts=5, delta=0.38, dollars_per_point=10.0)
    assert trade is not None
    assert not trade.hit_target
    assert trade.hold_bars == 20


# ----- harness -------------------------------------------------------------

def test_backtester_generates_and_simulates_trades():
    bars = {"CL": _mixed_bars(days=400, seed=3)}

    # Trivial scorer: score = 95 whenever RSI > 55 (call) or < 45 (put).
    def rsi(closes: pd.Series, period: int = 14) -> float:
        delta = closes.diff().dropna()
        gain = delta.clip(lower=0).rolling(period).mean()
        loss = (-delta.clip(upper=0)).rolling(period).mean()
        rs = gain / loss.replace(0, np.nan)
        val = (100 - 100 / (1 + rs)).iloc[-1]
        return float(val) if val == val else 50.0

    def scorer(symbol, side, history):
        r = rsi(history["close"])
        if side == "CALL" and r > 55:
            return 95.0, 0.38
        if side == "PUT" and r < 45:
            return 95.0, 0.38
        return None

    bt = Backtester(BacktestConfig(
        per_option_target_dollars=200.0, gate=90.0, contracts=5,
        entry_stride_bars=5, min_history_bars=60,
        dollars_per_point_map={"CL": 10.0},
    ))
    result = bt.run(bars, scorer)
    assert result.considered > 0
    assert len(result.trades) > 0
    assert len(result.cycles) >= 1
    # No cycle should have more than 12 trades.
    assert all(len(c) <= 12 for c in result.cycles)


# ----- report --------------------------------------------------------------

def test_monthly_hits_and_profile_comparison_shape():
    bars = {"CL": _mixed_bars(days=500, seed=9)}
    def scorer(symbol, side, history):
        return (95.0, 0.38) if side == "CALL" else None

    bt = Backtester(BacktestConfig(per_option_target_dollars=200.0, gate=90.0,
                                   contracts=5, entry_stride_bars=5))
    result = bt.run(bars, scorer)

    hits = monthly_hits(result.trades)
    assert set(hits.keys()) == set(range(1, 13))
    assert all(v >= 0 for v in hits.values())

    cmp = monthly_profile_comparison(result.trades)
    assert cmp.total_observed == sum(hits.values())
    assert cmp.total_expected == sum(TRANSCRIPT_PROFILE.values())
    assert set(cmp.diff.keys()) == set(range(1, 13))
    assert -1.0 <= cmp.correlation <= 1.0


def test_aggregate_metrics_shape():
    bars = {"CL": _mixed_bars(days=400, seed=5),
            "NQ": _mixed_bars(days=400, seed=17, start=200.0)}
    def scorer(symbol, side, history):
        return (95.0, 0.38) if side == "CALL" else None
    bt = Backtester(BacktestConfig(per_option_target_dollars=200.0, gate=90.0,
                                   contracts=5, entry_stride_bars=5))
    result = bt.run(bars, scorer)
    agg = aggregate_metrics(result.trades, result.cycles)
    assert agg.n_trades == len(result.trades)
    assert 0.0 <= agg.hit_rate <= 1.0
    assert set(agg.by_symbol.keys()).issubset({"CL", "NQ"})
    for sym, stats in agg.by_symbol.items():
        assert 0.0 <= stats["hit_rate"] <= 1.0
        assert stats["n"] > 0
