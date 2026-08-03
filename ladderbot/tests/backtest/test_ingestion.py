"""Smoke tests for the historical bar ingestion loaders (Sprint 9)."""

from unittest.mock import patch

import pandas as pd
import pytest

from ladderbot.backtest.ingestion import (
    SyntheticHistoryLoader, RegimeSpec, YFinanceLoader, YFinanceUnavailable,
)


def test_synthetic_history_produces_correct_shape():
    loader = SyntheticHistoryLoader(years=2)
    df = loader.load_symbol("CL", start_price=82.5, master_seed=7)
    assert len(df) == 2 * 252
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert df["high"].ge(df["low"]).all()
    assert (df["volume"] > 0).all()


def test_synthetic_history_is_deterministic_per_seed():
    a = SyntheticHistoryLoader(years=1).load_symbol("CL", master_seed=7)
    b = SyntheticHistoryLoader(years=1).load_symbol("CL", master_seed=7)
    assert a["close"].equals(b["close"])


def test_synthetic_history_different_symbols_different_paths():
    a = SyntheticHistoryLoader(years=1).load_symbol("CL", master_seed=7)
    b = SyntheticHistoryLoader(years=1).load_symbol("NQ", master_seed=7)
    assert not a["close"].equals(b["close"])


def test_synthetic_history_load_universe():
    loader = SyntheticHistoryLoader(years=1)
    bars = loader.load_universe(["CL", "NQ", "ES"],
                                start_prices={"CL": 82.5, "NQ": 18000.0})
    assert set(bars.keys()) == {"CL", "NQ", "ES"}
    assert bars["CL"]["close"].iloc[0] != bars["NQ"]["close"].iloc[0]


def test_yfinance_loader_raises_when_module_missing():
    with patch.dict("sys.modules", {"yfinance": None}):
        loader = YFinanceLoader()
        with pytest.raises(YFinanceUnavailable):
            loader.load_symbol("CL")


def test_yfinance_loader_returns_none_on_download_failure():
    """When yfinance.download raises, load_symbol returns None (falls back)."""
    class _FakeYF:
        @staticmethod
        def download(*args, **kwargs):
            raise ConnectionError("proxy blocked")

    with patch.dict("sys.modules", {"yfinance": _FakeYF}):
        loader = YFinanceLoader()
        assert loader.load_symbol("CL") is None


def test_yfinance_loader_normalizes_columns():
    class _FakeYF:
        @staticmethod
        def download(*args, **kwargs):
            idx = pd.date_range("2024-01-01", periods=5)
            return pd.DataFrame({
                "Open":  [100.0, 101.0, 102.0, 103.0, 104.0],
                "High":  [101.0, 102.0, 103.0, 104.0, 105.0],
                "Low":   [ 99.0, 100.0, 101.0, 102.0, 103.0],
                "Close": [100.5, 101.5, 102.5, 103.5, 104.5],
                "Volume":[1000, 1200, 900, 1100, 1300],
            }, index=idx)

    with patch.dict("sys.modules", {"yfinance": _FakeYF}):
        loader = YFinanceLoader()
        df = loader.load_symbol("CL")
        assert df is not None
        assert set(df.columns) == {"open", "high", "low", "close", "volume"}
        assert len(df) == 5


def test_regime_spec_fields():
    r = RegimeSpec("test", drift_daily=0.001, vol_daily=0.02)
    assert r.min_days == 20
    assert r.max_days == 60
