"""Smoke tests for the LadderBot execution layer (Sprint 4)."""

from datetime import date
from typing import Dict

import numpy as np
import pandas as pd
import pytest

from ladderbot.execution import (
    LadderExecutionEngine,
    OrderRequest, OrderSide, OrderStatus,
    PaperBroker,
    SyntheticChainProvider,
    chain_provider_to_option_context,
)
from ladderbot.execution.chain_provider import (
    ChainQuote, ChainSnapshot, SyntheticChainSpec, pick_strike_by_delta,
)
from ladderbot.strategy import LadderStrategy


def _bars(days=120, drift=0.001, vol=0.01, seed=7, start=100.0):
    rng = np.random.default_rng(seed)
    r = rng.normal(drift, vol, days)
    close = start * np.exp(np.cumsum(r))
    high = close * (1 + rng.uniform(0, 0.005, days))
    low = close * (1 - rng.uniform(0, 0.005, days))
    idx = pd.date_range("2026-01-01", periods=days, freq="D")
    return pd.DataFrame({"open": close, "high": high, "low": low, "close": close,
                         "volume": rng.integers(500, 2000, days)}, index=idx)


def _spot_map() -> Dict[str, float]:
    return {"CL": 82.5, "NQ": 18000.0, "ES": 5000.0}


def _make_chain_provider(spot: float = 82.5, iv: float = 0.30):
    return SyntheticChainProvider(SyntheticChainSpec(
        underlying_provider=lambda s: spot,
        iv_provider=lambda s: iv,
        strike_spacing=1.0,
        strikes_each_side=10,
    ))


def test_synthetic_chain_shape_and_delta():
    provider = _make_chain_provider(spot=82.5, iv=0.30)
    chain = provider.get_chain("CL", target_dte=45)
    assert chain is not None
    assert chain.underlying_price == 82.5
    assert chain.days_to_expiration == 45
    assert len(chain.calls()) > 5
    assert len(chain.puts()) > 5

    pick = pick_strike_by_delta(chain, target_delta=0.38, option_type="call")
    assert pick is not None
    assert abs(abs(pick.delta) - 0.38) < 0.15


def test_paper_broker_fills_at_ask_and_bid():
    provider = _make_chain_provider()
    broker = PaperBroker(chain_provider=provider)
    chain = provider.get_chain("CL", target_dte=45)
    call = next(q for q in chain.calls() if abs(abs(q.delta or 0) - 0.4) < 0.1)

    buy = broker.submit(OrderRequest(
        symbol="CL", option_type="call", strike=call.strike,
        expiration=chain.expiration, side=OrderSide.BUY_TO_OPEN, contracts=5,
    ))
    assert buy.status == OrderStatus.FILLED
    assert buy.filled_contracts == 5
    assert buy.avg_fill_price_points == pytest.approx(call.ask, rel=1e-4)

    sell = broker.submit(OrderRequest(
        symbol="CL", option_type="call", strike=call.strike,
        expiration=chain.expiration, side=OrderSide.SELL_TO_CLOSE, contracts=5,
    ))
    assert sell.status == OrderStatus.FILLED
    assert sell.avg_fill_price_points == pytest.approx(call.bid, rel=1e-4)


def test_broker_rejects_missing_strike():
    provider = _make_chain_provider()
    broker = PaperBroker(chain_provider=provider)
    order = broker.submit(OrderRequest(
        symbol="CL", option_type="call", strike=9999.0,
        expiration=date.today(), side=OrderSide.BUY_TO_OPEN, contracts=1,
    ))
    assert order.status == OrderStatus.REJECTED
    assert "no quote" in (order.reject_reason or "")


def test_chain_provider_to_option_context_shape():
    provider = _make_chain_provider()
    ctx_fn = chain_provider_to_option_context(provider, target_delta=0.38)
    df = _bars()
    ctx = ctx_fn(symbol="CL", side="CALL", df=df)
    assert ctx is not None
    for key in ("delta", "iv_rank", "days_to_expiration",
                "premium_points", "premium_dollars", "dollars_per_point", "strike"):
        assert key in ctx
    assert ctx["dollars_per_point"] == 10.0
    assert ctx["premium_dollars"] > 0


def test_execution_engine_round_trip_hits_target_on_iv_pump():
    """Verify signal -> fill -> target-hit -> exit -> cycle record."""
    provider = _make_chain_provider(spot=82.5, iv=0.30)

    class MockBroker(PaperBroker):
        """Real fills for entry; adds a fixed pump to mid + sell fills."""
        pump: float = 0.0
        def current_option_mid(self, order):
            base = super().current_option_mid(order)
            return None if base is None else base + self.pump
        def submit(self, request):
            order = super().submit(request)
            if request.side == OrderSide.SELL_TO_CLOSE and order.fills:
                for f in order.fills:
                    f.price_points += self.pump
            return order

    broker = MockBroker(chain_provider=provider)
    strat = LadderStrategy({
        "starting_capital": 20_000.0,
        "per_option_target_dollars": 225.0,
        "universe": ["CL"],
    })
    engine = LadderExecutionEngine(strategy=strat, broker=broker,
                                   chain_provider=provider, target_delta=0.38)

    from ladderbot._base import StrategySignal, TradingSignal
    signal = TradingSignal(
        symbol="CL", signal=StrategySignal.STRONG_BUY,
        confidence=0.95, strength=1.0, urgency=0.6, target_weight=0.5,
        take_profit=225.0,
        metadata={
            "strategy": "ladder", "side": "CALL",
            "ladder_score": 96.0, "expected_dollars_per_hour": 200.0,
            "contracts": 5, "premium_dollars": 800.0, "premium_points": 80.0,
            "target_move_points": 22.5, "delta": 0.38,
            "days_to_expiration": 45,
            "cycle_trade_number": 1, "features": {}, "gate": 90.0,
        },
    )
    # Pump each contract's mid by +30 points (well above 22.5 needed for $225/opt).
    broker.pump = 30.0

    rt = engine.run_signal(signal)
    assert rt is not None
    assert rt.entry_order.status == OrderStatus.FILLED
    assert rt.target_reached
    assert rt.exit_order is not None and rt.exit_order.status == OrderStatus.FILLED
    assert rt.realized_pnl is not None and rt.realized_pnl > 0

    # Cycle governor should have logged trade #1.
    assert engine.strategy.governor.state.trade_count == 1


def test_execution_engine_no_close_when_target_not_reached():
    provider = _make_chain_provider()
    broker = PaperBroker(chain_provider=provider)
    strat = LadderStrategy({
        "starting_capital": 20_000.0,
        "per_option_target_dollars": 225.0,
        "universe": ["CL"],
    })
    engine = LadderExecutionEngine(strategy=strat, broker=broker,
                                   chain_provider=provider, target_delta=0.38,
                                   max_poll_ticks=5)
    from ladderbot._base import StrategySignal, TradingSignal
    signal = TradingSignal(
        symbol="CL", signal=StrategySignal.STRONG_BUY,
        confidence=0.95, strength=1.0, urgency=0.6, target_weight=0.5,
        take_profit=225.0,
        metadata={
            "strategy": "ladder", "side": "CALL",
            "ladder_score": 96.0, "expected_dollars_per_hour": 200.0,
            "contracts": 5, "premium_dollars": 800.0, "premium_points": 80.0,
            "target_move_points": 22.5, "delta": 0.38,
            "days_to_expiration": 45,
            "cycle_trade_number": 1, "features": {}, "gate": 90.0,
        },
    )
    rt = engine.run_signal(signal)
    assert rt is not None
    assert rt.entry_order.status == OrderStatus.FILLED
    assert not rt.target_reached
    assert rt.exit_order is None
    # Governor untouched since no close occurred.
    assert engine.strategy.governor.state.trade_count == 0
