"""Smoke tests for the LadderBot persistence layer (Sprint 5)."""

import os
import tempfile

import pytest

from ladderbot._base import StrategySignal, TradingSignal
from ladderbot import CycleGovernor
from ladderbot.execution import (
    LadderExecutionEngine, OrderRequest, OrderSide, PaperBroker,
    SyntheticChainProvider,
)
from ladderbot.execution.chain_provider import SyntheticChainSpec
from ladderbot.persistence import (
    CycleRepository, OrderRepository, PersistentEngine, PersistentGovernor,
    TraceSlipRepository, init_db,
)
from ladderbot.persistence.persistent_governor import open_or_resume
from ladderbot.strategy import LadderStrategy


@pytest.fixture
def tmp_db():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    init_db(path)
    yield path
    os.unlink(path)


def _make_chain_provider():
    return SyntheticChainProvider(SyntheticChainSpec(
        underlying_provider=lambda s: 82.5, iv_provider=lambda s: 0.30,
        strike_spacing=1.0, strikes_each_side=10,
    ))


def _signal():
    return TradingSignal(
        symbol="CL", signal=StrategySignal.STRONG_BUY,
        confidence=0.96, strength=1.0, urgency=0.6, target_weight=0.5,
        take_profit=225.0,
        metadata={
            "strategy": "ladder", "side": "CALL",
            "ladder_score": 96.0, "expected_dollars_per_hour": 200.0,
            "contracts": 5, "premium_dollars": 800.0, "premium_points": 80.0,
            "target_move_points": 22.5, "delta": 0.38, "days_to_expiration": 45,
            "cycle_trade_number": 1, "features": {}, "gate": 90.0,
        },
    )


def test_init_db_creates_all_tables(tmp_db):
    from ladderbot.persistence.db import connect
    conn = connect(tmp_db)
    try:
        tables = {r["name"] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
    finally:
        conn.close()
    for t in ("cycles", "cycle_trades", "trace_slips", "orders", "fills"):
        assert t in tables


def test_cycle_repository_round_trip(tmp_db):
    repo = CycleRepository(tmp_db)
    gov = CycleGovernor(starting_capital=20_000, per_option_target_dollars=225.0)
    cycle_id = repo.create(gov.state)
    assert cycle_id > 0

    gov.record_trade(pnl_dollars=225.0, meta={"symbol": "CL"})
    latest = gov.state.trades[-1]
    repo.append_trade(cycle_id, latest)
    repo.update_state(cycle_id, gov.state)

    restored = repo.restore_governor(cycle_id)
    assert restored.state.trade_count == 1
    assert restored.state.current_capital == 20_225.0
    assert restored.state.trades[0]["symbol"] == "CL"


def test_persistent_governor_resume_after_restart(tmp_db):
    repo = CycleRepository(tmp_db)
    gov = open_or_resume(repo, starting_capital=20_000, per_option_target_dollars=225.0)
    gov.record_trade(pnl_dollars=225.0, meta={"symbol": "CL"})
    gov.record_trade(pnl_dollars=225.0, meta={"symbol": "NQ"})
    first_cycle_id = gov.cycle_id

    # simulate process restart
    gov2 = open_or_resume(repo, starting_capital=999_999.0)  # ignored: existing cycle
    assert gov2.cycle_id == first_cycle_id
    assert gov2.state.trade_count == 2
    assert gov2.state.current_capital == 20_450.0

    ok, _ = gov2.can_open_trade()
    assert ok
    gov2.record_trade(pnl_dollars=225.0, meta={"symbol": "ES"})
    assert gov2.state.trade_count == 3

    rec = repo.get(first_cycle_id)
    assert rec is not None and rec.state.trade_count == 3


def test_persistent_engine_persists_slip_orders_fills(tmp_db):
    provider = _make_chain_provider()

    class MockBroker(PaperBroker):
        pump: float = 30.0
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
    strategy = LadderStrategy({
        "starting_capital": 20_000.0, "per_option_target_dollars": 225.0,
        "universe": ["CL"],
    })
    engine = LadderExecutionEngine(strategy=strategy, broker=broker,
                                   chain_provider=provider, target_delta=0.38)

    cycle_repo = CycleRepository(tmp_db)
    slip_repo = TraceSlipRepository(tmp_db)
    order_repo = OrderRepository(tmp_db)
    cycle_id = cycle_repo.create(strategy.governor.state)

    persistent = PersistentEngine(engine=engine, cycle_id=cycle_id,
                                  slip_repo=slip_repo, order_repo=order_repo)
    rt = persistent.run_signal(_signal())
    assert rt is not None and rt.target_reached

    slips = slip_repo.list_for_cycle(cycle_id)
    assert len(slips) == 1
    slip = slips[0]
    assert slip["symbol"] == "CL"
    assert slip["realized_pnl_dollars"] > 0
    assert slip["exit_fill_points"] is not None

    orders = order_repo.list_for_slip(slip["id"])
    assert len(orders) == 2                    # entry + exit
    assert {o["side"] for o in orders} == {"BUY_TO_OPEN", "SELL_TO_CLOSE"}


def test_order_repo_client_order_id_is_idempotent(tmp_db):
    from ladderbot.execution.order import (
        LadderOrder, OrderStatus,
    )
    from datetime import date
    repo = OrderRepository(tmp_db)
    req = OrderRequest(symbol="CL", option_type="call", strike=85.0,
                       expiration=date.today(), side=OrderSide.BUY_TO_OPEN,
                       contracts=5, client_order_id="fixed-abc")
    order = LadderOrder(request=req, status=OrderStatus.FILLED)
    order.add_fill(price_points=2.4, contracts=5)

    id1 = repo.upsert_order(order, slip_id=None)
    id2 = repo.upsert_order(order, slip_id=None)
    assert id1 == id2

    # Fills also idempotent — no dup rows.
    from ladderbot.persistence.db import connect
    conn = connect(tmp_db)
    try:
        n = conn.execute("SELECT COUNT(*) FROM fills WHERE order_id = ?",
                         (order.order_id,)).fetchone()[0]
    finally:
        conn.close()
    assert n == 1
