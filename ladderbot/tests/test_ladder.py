"""Smoke tests for LadderBot sprint 1 scaffolding."""

import numpy as np
import pandas as pd
import pytest

from ladderbot.cycle import CycleGovernor
from ladderbot.instruments import INSTRUMENTS
from ladderbot.scorer import LadderScorer
from ladderbot.strategy import LadderStrategy
from ladderbot.trace_slip import TraceSlip


def _fake_ohlcv(days: int = 120, drift: float = 0.001, vol: float = 0.01, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    returns = rng.normal(drift, vol, size=days)
    close = 100.0 * np.exp(np.cumsum(returns))
    high = close * (1 + rng.uniform(0, 0.005, size=days))
    low = close * (1 - rng.uniform(0, 0.005, size=days))
    vol_series = rng.integers(500, 2000, size=days)
    idx = pd.date_range("2026-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close, "volume": vol_series}, index=idx)


def test_instruments_point_dollar_math():
    cl = INSTRUMENTS["CL"]
    assert cl.points_to_dollars(20) == 200.0
    assert cl.dollars_to_points(225) == 22.5
    zs = INSTRUMENTS["ZS"]
    assert zs.dollars_to_points(225) == 4.5


def test_trace_slip_pnl():
    slip = TraceSlip(
        symbol="CL", side="CALL", contracts=20,
        entry_price_points=84.0, target_price_points=107.0,
        entry_fill_points=84.0, exit_fill_points=107.0,
    )
    assert slip.cost_dollars == pytest.approx(84 * 10 * 20)
    assert slip.realized_pnl_dollars == pytest.approx((107 - 84) * 10 * 20)
    assert slip.realized_pnl_per_contract == pytest.approx((107 - 84) * 10)


def test_ladder_scorer_produces_score_and_gate():
    scorer = LadderScorer()
    df = _fake_ohlcv(drift=0.002)
    cand = scorer.score_candidate(
        symbol="CL", side="CALL", ohlcv=df,
        option_context={"delta": 0.38, "iv_rank": 0.4, "days_to_expiration": 45,
                        "premium_points": 80, "premium_dollars": 800, "dollars_per_point": 10},
        dollar_target=225.0,
    )
    assert cand is not None
    assert 0.0 <= cand.score <= 100.0
    assert (cand.score >= 90.0) == cand.is_tradable


def test_scorer_rejects_short_dte():
    scorer = LadderScorer()
    df = _fake_ohlcv()
    cand = scorer.score_candidate(
        symbol="ES", side="CALL", ohlcv=df,
        option_context={"delta": 0.4, "iv_rank": 0.3, "days_to_expiration": 10,
                        "premium_points": 20, "premium_dollars": 1000, "dollars_per_point": 50},
        dollar_target=225.0,
    )
    assert cand is None


def test_cycle_governor_caps_at_twelve():
    gov = CycleGovernor(starting_capital=20_000, per_option_target_dollars=225.0)
    for _ in range(12):
        ok, _ = gov.can_open_trade()
        assert ok
        gov.record_trade(pnl_dollars=225.0)
    ok, reason = gov.can_open_trade()
    assert not ok
    assert "13th" in reason or "cycle complete" in reason


def test_cycle_drawdown_kill_switch():
    gov = CycleGovernor(starting_capital=10_000, per_option_target_dollars=225.0, max_drawdown_pct=0.15)
    gov.record_trade(pnl_dollars=-2000.0)  # 20% dd from initial peak
    ok, reason = gov.can_open_trade()
    assert not ok
    assert "drawdown" in reason.lower()


def test_cycle_size_contracts_matches_transcript_pattern():
    gov = CycleGovernor(starting_capital=20_000, per_option_target_dollars=225.0)
    # $840 premium per contract, 84% utilization -> floor(16800/840) = 20
    assert gov.size_contracts(premium_dollars_per_contract=840.0) == 20


def test_strategy_end_to_end_signal_or_empty():
    strat = LadderStrategy({
        "starting_capital": 20_000.0,
        "per_option_target_dollars": 225.0,
        "universe": ["CL"],
    })
    df = _fake_ohlcv(drift=0.003, vol=0.008)
    signals = strat.generate_signals({"CL": df}, ["CL"])
    for s in signals:
        assert s.metadata["ladder_score"] >= 90.0
        assert s.metadata["contracts"] > 0
        assert s.symbol == "CL"
        slip = strat.build_trace_slip(s)
        assert slip.contracts == s.metadata["contracts"]
