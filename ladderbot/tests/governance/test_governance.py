"""Smoke tests for the LadderBot governance layer (Sprint 6)."""

import os
import tempfile
from datetime import datetime, timedelta

import pytest

from ladderbot._base import StrategySignal, TradingSignal
from ladderbot.execution import (
    LadderExecutionEngine, OrderSide, PaperBroker, SyntheticChainProvider,
)
from ladderbot.execution.chain_provider import SyntheticChainSpec
from ladderbot.governance import (
    AlertEvent, GuardedEngine, LogAlertChannel, MultiplexAlertChannel,
    RiskLimits, TradingGuard, WebhookAlertChannel, dashboard_snapshot,
    make_alert,
)
from ladderbot.governance.alerts import AlertSeverity
from ladderbot.persistence import (
    CycleRepository, OrderRepository, PersistentEngine, TraceSlipRepository,
    init_db,
)
from ladderbot.strategy import LadderStrategy


@pytest.fixture
def tmp_db():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    init_db(path)
    yield path
    os.unlink(path)


class _CapturingAlerter:
    def __init__(self):
        self.events: list[AlertEvent] = []

    def emit(self, event):
        self.events.append(event)


def _pumped_broker(pump=30.0):
    provider = SyntheticChainProvider(SyntheticChainSpec(
        underlying_provider=lambda s: 82.5, iv_provider=lambda s: 0.30,
        strike_spacing=1.0, strikes_each_side=10,
    ))

    class MockBroker(PaperBroker):
        _pump = pump
        def current_option_mid(self, order):
            base = super().current_option_mid(order)
            return None if base is None else base + self._pump
        def submit(self, request):
            order = super().submit(request)
            if request.side == OrderSide.SELL_TO_CLOSE and order.fills:
                for f in order.fills:
                    f.price_points += self._pump
            return order

    return provider, MockBroker(chain_provider=provider)


def _signal(symbol="CL", contracts=5, premium_dollars=800.0):
    return TradingSignal(
        symbol=symbol, signal=StrategySignal.STRONG_BUY,
        confidence=0.96, strength=1.0, urgency=0.6, target_weight=0.5,
        take_profit=225.0,
        metadata={
            "strategy": "ladder", "side": "CALL", "ladder_score": 96.0,
            "expected_dollars_per_hour": 200.0, "contracts": contracts,
            "premium_dollars": premium_dollars, "premium_points": premium_dollars / 10,
            "target_move_points": 22.5, "delta": 0.38, "days_to_expiration": 45,
            "cycle_trade_number": 1, "features": {}, "gate": 90.0,
        },
    )


def test_per_symbol_cap_blocks_second_position():
    guard = TradingGuard(RiskLimits(max_positions_per_symbol=1))
    guard.record_open("CL", "CALL", 5, 4000.0)
    d = guard.check_trade("CL", 5, 800.0, current_capital=20_000)
    assert not d.allowed
    assert d.triggered_rule == "max_positions_per_symbol"


def test_total_open_cap_blocks_after_n():
    guard = TradingGuard(RiskLimits(max_positions_per_symbol=1, max_total_open_positions=2))
    guard.record_open("CL", "CALL", 5, 4000.0)
    guard.record_open("NQ", "CALL", 5, 4000.0)
    d = guard.check_trade("ES", 5, 800.0, current_capital=20_000)
    assert not d.allowed
    assert d.triggered_rule == "max_total_open_positions"


def test_notional_cap_blocks_oversize():
    guard = TradingGuard(RiskLimits(max_notional_pct_per_trade=0.10))
    d = guard.check_trade("CL", contracts=10, premium_dollars_per_contract=1000.0,
                          current_capital=20_000)
    assert not d.allowed
    assert d.triggered_rule == "max_notional_pct_per_trade"


def test_daily_loss_limit_trips_after_losses():
    guard = TradingGuard(RiskLimits(daily_loss_limit_dollars=500.0,
                                    consecutive_losses_before_cooldown=999))
    guard.record_close("CL", -300.0)
    guard.record_close("NQ", -300.0)
    d = guard.check_trade("ES", 5, 800.0, current_capital=20_000)
    assert not d.allowed
    assert d.triggered_rule == "daily_loss_limit"


def test_cooldown_kicks_in_after_consecutive_losses():
    guard = TradingGuard(RiskLimits(consecutive_losses_before_cooldown=3,
                                    cooldown_minutes=30,
                                    daily_loss_limit_dollars=None))
    for _ in range(3):
        guard.record_close("CL", -100.0)
    d = guard.check_trade("NQ", 5, 800.0, current_capital=20_000)
    assert not d.allowed
    assert d.triggered_rule == "cooldown"


def test_log_alert_channel_writes(caplog):
    ch = LogAlertChannel(logger_name="bee_bot.ladder.governance.test")
    with caplog.at_level("WARNING", logger="bee_bot.ladder.governance.test"):
        ch.emit(make_alert("trade_rejected", "blocked CL: cap"))
    assert any("blocked CL" in r.message for r in caplog.records)


def test_webhook_alert_channel_uses_injected_poster():
    calls = []
    def fake_post(url, body, timeout):
        calls.append((url, body, timeout))
    ch = WebhookAlertChannel(url="https://example.com/hook", http_post=fake_post)
    ch.emit(make_alert("trade_opened", "opened CL", AlertSeverity.INFO, symbol="CL"))
    assert len(calls) == 1
    assert calls[0][0] == "https://example.com/hook"
    assert b"trade_opened" in calls[0][1]


def test_multiplex_survives_bad_channel():
    class Bad:
        def emit(self, event):
            raise RuntimeError("boom")
    class Good:
        def __init__(self): self.got = []
        def emit(self, event): self.got.append(event)
    good = Good()
    mux = MultiplexAlertChannel(channels=[Bad(), good])
    mux.emit(make_alert("info", "hi"))
    assert len(good.got) == 1


def test_guarded_engine_blocks_and_emits_alert(tmp_db):
    provider, broker = _pumped_broker()
    strategy = LadderStrategy({
        "starting_capital": 20_000.0, "per_option_target_dollars": 225.0,
        "universe": ["CL"],
    })
    engine = LadderExecutionEngine(strategy=strategy, broker=broker,
                                   chain_provider=provider, target_delta=0.38)

    # Set an intentionally impossible notional cap so every trade blocks.
    guard = TradingGuard(RiskLimits(max_notional_pct_per_trade=0.001))
    alerter = _CapturingAlerter()
    guarded = GuardedEngine(inner=engine, guard=guard, alerter=alerter)

    rt = guarded.execute_signal(_signal())
    assert rt is None
    assert len(alerter.events) == 1
    assert alerter.events[0].kind == "trade_rejected"
    assert alerter.events[0].metadata["triggered_rule"] == "max_notional_pct_per_trade"


def test_guarded_engine_end_to_end_open_close_alerts(tmp_db):
    provider, broker = _pumped_broker(pump=30.0)
    strategy = LadderStrategy({
        "starting_capital": 20_000.0, "per_option_target_dollars": 225.0,
        "universe": ["CL"],
    })
    engine = LadderExecutionEngine(strategy=strategy, broker=broker,
                                   chain_provider=provider, target_delta=0.38)

    guard = TradingGuard(RiskLimits())
    alerter = _CapturingAlerter()
    guarded = GuardedEngine(inner=engine, guard=guard, alerter=alerter)

    rt = guarded.run_signal(_signal())
    assert rt is not None and rt.target_reached

    kinds = [e.kind for e in alerter.events]
    assert "trade_opened" in kinds
    assert "trade_closed" in kinds
    assert guard.snapshot()["open_count"] == 0


def test_dashboard_snapshot_shape(tmp_db):
    provider, broker = _pumped_broker(pump=30.0)
    strategy = LadderStrategy({
        "starting_capital": 20_000.0, "per_option_target_dollars": 225.0,
        "universe": ["CL"],
    })
    engine = LadderExecutionEngine(strategy=strategy, broker=broker,
                                   chain_provider=provider, target_delta=0.38)

    cycle_repo = CycleRepository(tmp_db)
    slip_repo = TraceSlipRepository(tmp_db)
    order_repo = OrderRepository(tmp_db)

    # Swap the strategy's in-memory governor for a PersistentGovernor so
    # trade updates hit the DB.
    from ladderbot.persistence.persistent_governor import open_or_resume
    pgov = open_or_resume(cycle_repo, starting_capital=20_000.0,
                          per_option_target_dollars=225.0)
    strategy.governor = pgov
    cycle_id = pgov.cycle_id

    persistent = PersistentEngine(engine=engine, cycle_id=cycle_id,
                                  slip_repo=slip_repo, order_repo=order_repo)
    guard = TradingGuard(RiskLimits())
    guarded = GuardedEngine(inner=persistent, guard=guard,
                            alerter=_CapturingAlerter())
    guarded.run_signal(_signal())

    snap = dashboard_snapshot(cycle_repo, slip_repo, guard=guard).to_dict()
    assert snap["cycle"] is not None
    assert snap["cycle"]["trade_count"] == 1
    assert snap["cycle"]["trades_remaining"] == 11
    assert len(snap["recent_slips"]) == 1
    assert snap["guard"] is not None
    assert snap["guard"]["open_count"] == 0
