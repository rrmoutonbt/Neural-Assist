"""Smoke tests for the futures_features feature pipeline (Sprint 2)."""

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from ladderbot.features import (
    OptionChain, OptionQuote,
    atr, bs_greeks, bs_price, build_option_context,
    clearance_in_atr, cluster_levels, dead_zone_flag, fib_levels,
    implied_volatility, iv_rank, monthly_edge, nearest_fib, nearest_levels,
    pick_strike_by_delta, realized_vol, seasonality_score, swing_pivots,
)
from ladderbot.features.support_resistance import detect_levels


def _bars(days=180, drift=0.0005, vol=0.01, seed=13, start=100.0):
    rng = np.random.default_rng(seed)
    r = rng.normal(drift, vol, days)
    close = start * np.exp(np.cumsum(r))
    high = close * (1 + rng.uniform(0, 0.006, days))
    low  = close * (1 - rng.uniform(0, 0.006, days))
    idx = pd.date_range("2025-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close,
                         "volume": rng.integers(500, 2000, days)}, index=idx)


def test_swing_pivots_shape():
    df = _bars()
    hi, lo = swing_pivots(df, left=3, right=3)
    assert len(hi) == len(df) and len(lo) == len(df)
    assert hi.sum() > 0 and lo.sum() > 0


def test_cluster_levels_merges_within_tolerance():
    prices = [100.0, 100.1, 100.2, 105.0, 105.05, 110.0]
    levels = cluster_levels(prices, tolerance_pct=0.005, min_touches=2, kind="resistance")
    assert len(levels) == 2
    assert 100.0 < levels[0].price < 100.3
    assert 104.9 < levels[1].price < 105.2


def test_detect_and_clearance():
    df = _bars()
    levels = detect_levels(df)
    price = df["close"].iloc[-1]
    _sup, _res = nearest_levels(price, levels)
    a = atr(df)
    # If a resistance exists above, clearance is finite and >= 0
    if _res is not None:
        assert clearance_in_atr(price, _res, a) >= 0.0


def test_fib_levels_ratios_present():
    df = _bars()
    levels = fib_levels(df, window=60)
    for r in (0.236, 0.382, 0.5, 0.618, 0.786, 1.0):
        assert r in levels
    ratio, price = nearest_fib(df["close"].iloc[-1], levels)
    assert 0.0 <= ratio <= 2.0


def test_dead_zone_detection_handles_no_signal():
    df = _bars(drift=0.0, vol=0.001)   # near-flat
    dz = dead_zone_flag(df)
    assert dz is None or dz[1] in {"reject_up", "reject_down"}


def test_volatility_helpers():
    df = _bars()
    assert atr(df) > 0
    rv = realized_vol(df)
    assert 0.0 < rv < 5.0
    rank = iv_rank(0.25, [0.1, 0.2, 0.3, 0.25, 0.15])
    assert 0.0 <= rank <= 1.0


def test_bs_price_and_greeks_call_put_parity():
    S, K, T, r, sigma = 100.0, 100.0, 0.5, 0.05, 0.25
    c = bs_price(S, K, T, r, sigma, "call")
    p = bs_price(S, K, T, r, sigma, "put")
    # put-call parity: C - P = S*exp((b-r)T) - K*exp(-rT); with b=r default it reduces
    parity_rhs = S - K * np.exp(-r * T)
    assert abs((c - p) - parity_rhs) < 1e-6

    g = bs_greeks(S, K, T, r, sigma, "call")
    assert 0.0 < g.delta < 1.0
    assert g.gamma > 0.0
    assert g.vega > 0.0


def test_implied_vol_roundtrip():
    S, K, T, r, sigma = 100.0, 105.0, 0.4, 0.03, 0.28
    price = bs_price(S, K, T, r, sigma, "call")
    solved = implied_volatility(price, S, K, T, r, "call")
    assert abs(solved - sigma) < 1e-3


def test_option_chain_pick_strike_by_delta():
    S = 100.0
    strikes = [90.0, 95.0, 100.0, 105.0, 110.0]
    quotes = []
    for k in strikes:
        c = bs_price(S, k, 0.25, 0.05, 0.30, "call")
        quotes.append(OptionQuote(strike=k, option_type="call", bid=c - 0.05, ask=c + 0.05))
    chain = OptionChain(symbol="TEST", underlying_price=S,
                        expiration=date.today() + timedelta(days=90),
                        days_to_expiration=90, quotes=quotes)
    chain.enrich_greeks()
    pick = pick_strike_by_delta(chain, target_delta=0.38, option_type="call")
    assert pick is not None
    assert pick.delta is not None
    assert abs(abs(pick.delta) - 0.38) < 0.15


def test_seasonality_bounds():
    df = _bars(days=400)
    m = monthly_edge(df)
    assert all(0.0 <= v <= 1.0 for v in m.values())
    s = seasonality_score(df, df.index[-1])
    assert 0.0 <= s <= 1.0


def test_build_option_context_shape():
    df = _bars()
    S = float(df["close"].iloc[-1])
    strikes = [S - 5, S - 2.5, S, S + 2.5, S + 5]
    quotes = []
    for k in strikes:
        c = bs_price(S, k, 45/365, 0.05, 0.30, "call")
        quotes.append(OptionQuote(strike=k, option_type="call", bid=c-0.05, ask=c+0.05))
    chain = OptionChain(symbol="CL", underlying_price=S,
                        expiration=date.today() + timedelta(days=45),
                        days_to_expiration=45, quotes=quotes)
    ctx = build_option_context(df=df, chain=chain, dollars_per_point=10.0,
                               side="CALL", target_delta=0.38,
                               iv_history=[0.25, 0.28, 0.30, 0.32, 0.29])
    for key in ("delta", "iv_rank", "days_to_expiration",
                "premium_points", "premium_dollars", "dollars_per_point",
                "sr_clearance_atr", "seasonality"):
        assert key in ctx
    assert ctx["dollars_per_point"] == 10.0
    assert ctx["days_to_expiration"] == 45
    assert ctx["premium_dollars"] > 0.0
