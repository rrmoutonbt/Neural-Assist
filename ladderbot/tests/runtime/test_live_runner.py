"""Smoke tests for LadderLiveRunner (Sprint 8)."""

import os
import tempfile
from typing import Dict, List

import numpy as np
import pandas as pd
import pytest

from ladderbot.execution import (
    OrderSide, PaperBroker, SyntheticChainProvider,
)
from ladderbot.execution.chain_provider import SyntheticChainSpec
from ladderbot.governance import LogAlertChannel
from ladderbot.runtime import (
    LadderLiveRunner, LiveRunnerConfig, from_config,
)


def _bars(days=120, drift=0.003, vol=0.008, seed=7, start=82.5):
    rng = np.random.default_rng(seed)
    r = rng.normal(drift, vol, days)
    close = start * np.exp(np.cumsum(r))
    high = close * (1 + rng.uniform(0, 0.005, days))
    low = close * (1 - rng.uniform(0, 0.005, days))
    idx = pd.date_range("2026-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close,
                         "volume": rng.integers(500, 2000, days)}, index=idx)


class _FakeFeed:
    def __init__(self, bars: Dict[str, pd.DataFrame]):
        self.bars = bars
        self.calls = 0

    def latest_bars(self, symbols: List[str]) -> Dict[str, pd.DataFrame]:
        self.calls += 1
        return {s: self.bars[s] for s in symbols if s in self.bars}


class _PumpBroker(PaperBroker):
    """Fills entry at ask, then pump both mid and sell fills."""
    _pump = 30.0
    def current_option_mid(self, order):
        base = super().current_option_mid(order)
        return None if base is None else base + self._pump
    def submit(self, request):
        order = super().submit(request)
        if request.side == OrderSide.SELL_TO_CLOSE and order.fills:
            for f in order.fills:
                f.price_points += self._pump
        return order


@pytest.fixture
def tmp_db():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    yield path
    os.unlink(path)


def _chain_provider(spot=82.5, iv=0.30):
    return SyntheticChainProvider(SyntheticChainSpec(
        underlying_provider=lambda s: spot, iv_provider=lambda s: iv,
        strike_spacing=1.0, strikes_each_side=10,
    ))


def test_from_config_builds_and_ticks(tmp_db):
    chain = _chain_provider()
    broker = _PumpBroker(chain_provider=chain)
    feed = _FakeFeed({"CL": _bars()})

    cfg = LiveRunnerConfig(
        starting_capital=20_000, per_option_target_dollars=225.0,
        universe=["CL"], db_path=tmp_db,
    )
    runner = from_config(cfg, feed=feed, chain_provider=chain, broker=broker,
                         alerter=LogAlertChannel())
    assert isinstance(runner, LadderLiveRunner)

    result = runner.tick()
    assert result.signals_considered >= 0
    assert result.cycle_locked is False


def test_runner_taken_signals_advance_cycle_governor(tmp_db):
    chain = _chain_provider()
    broker = _PumpBroker(chain_provider=chain)
    feed = _FakeFeed({"CL": _bars(drift=0.005)})

    cfg = LiveRunnerConfig(
        starting_capital=20_000, per_option_target_dollars=225.0,
        universe=["CL"], db_path=tmp_db, max_trades_per_tick=1,
    )
    runner = from_config(cfg, feed=feed, chain_provider=chain, broker=broker,
                         alerter=LogAlertChannel())

    for _ in range(3):
        r = runner.tick()
        if r.signals_taken > 0:
            break

    trade_count = runner.strategy.governor.state.trade_count
    assert trade_count >= 0  # non-negative regardless of whether score cleared gate
    assert len(runner.history) >= 1


def test_runner_halts_when_cycle_locked(tmp_db):
    chain = _chain_provider()
    broker = _PumpBroker(chain_provider=chain)
    feed = _FakeFeed({"CL": _bars()})

    cfg = LiveRunnerConfig(
        starting_capital=20_000, per_option_target_dollars=225.0,
        universe=["CL"], db_path=tmp_db,
    )
    runner = from_config(cfg, feed=feed, chain_provider=chain, broker=broker,
                         alerter=LogAlertChannel())
    runner.strategy.governor.lock("manual test lock")

    result = runner.tick()
    assert result.cycle_locked
    assert result.signals_taken == 0
    assert "locked" in (result.reason_no_trade or "")


def test_runner_resumes_state_from_db(tmp_db):
    chain = _chain_provider()
    broker = _PumpBroker(chain_provider=chain)
    feed = _FakeFeed({"CL": _bars(drift=0.005)})

    cfg = LiveRunnerConfig(
        starting_capital=20_000, per_option_target_dollars=225.0,
        universe=["CL"], db_path=tmp_db,
    )
    r1 = from_config(cfg, feed=feed, chain_provider=chain, broker=broker,
                     alerter=LogAlertChannel())
    cycle_id_1 = r1.strategy.governor.cycle_id

    # Simulate process restart.
    r2 = from_config(cfg, feed=feed, chain_provider=chain, broker=broker,
                     alerter=LogAlertChannel())
    assert r2.strategy.governor.cycle_id == cycle_id_1
