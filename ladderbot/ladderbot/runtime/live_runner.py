"""LadderLiveRunner: the "flip the switch" object.

Composes the full ladder stack into a single tick loop:
    MarketDataFeed -> LadderStrategy.generate_signals
                    -> GuardedEngine(PersistentEngine(LadderExecutionEngine))
                    -> CycleGovernor / TradingGuard / alerts / persistence

One tick = one signal cycle. In production this loop runs on a
scheduler (cron, asyncio.sleep, threading.Timer) that the caller
owns; the runner itself doesn't touch time. Tests drive it by
calling tick() directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Protocol

import pandas as pd

from ladderbot.execution.broker import LadderBroker, PaperBroker
from ladderbot.execution.chain_provider import OptionChainProvider
from ladderbot.execution.engine import (
    LadderExecutionEngine, TradeRoundTrip,
)
from ladderbot.execution.provider_adapter import (
    chain_provider_to_option_context,
)
from ladderbot.governance.alerts import (
    AlertChannel, AlertSeverity, LogAlertChannel, make_alert,
)
from ladderbot.governance.guarded_engine import GuardedEngine
from ladderbot.governance.limits import RiskLimits, TradingGuard
from ladderbot.persistence.cycle_repo import CycleRepository
from ladderbot.persistence.db import init_db
from ladderbot.persistence.order_repo import OrderRepository
from ladderbot.persistence.persistent_engine import PersistentEngine
from ladderbot.persistence.persistent_governor import open_or_resume
from ladderbot.persistence.slip_repo import TraceSlipRepository
from ladderbot.strategy import LadderStrategy


class MarketDataFeed(Protocol):
    def latest_bars(self, symbols: List[str]) -> Dict[str, pd.DataFrame]: ...


@dataclass
class LiveRunnerConfig:
    starting_capital: float = 20_000.0
    per_option_target_dollars: float = 225.0
    universe: List[str] = field(default_factory=lambda: ["CL", "NQ", "ES", "ZS"])
    target_delta: float = 0.38
    db_path: str = "ladder.db"
    risk_limits: RiskLimits = field(default_factory=RiskLimits)
    max_trades_per_tick: int = 1


@dataclass
class RunnerTickResult:
    at: datetime
    signals_considered: int
    signals_taken: int
    round_trips: List[TradeRoundTrip] = field(default_factory=list)
    cycle_locked: bool = False
    reason_no_trade: Optional[str] = None


class LadderLiveRunner:
    def __init__(
        self,
        strategy: LadderStrategy,
        engine: GuardedEngine,
        feed: MarketDataFeed,
        cycle_repo: CycleRepository,
        slip_repo: TraceSlipRepository,
        order_repo: OrderRepository,
        alerter: AlertChannel,
        config: LiveRunnerConfig,
    ):
        self.strategy = strategy
        self.engine = engine
        self.feed = feed
        self.cycle_repo = cycle_repo
        self.slip_repo = slip_repo
        self.order_repo = order_repo
        self.alerter = alerter
        self.config = config
        self._history: List[RunnerTickResult] = []

    def tick(self) -> RunnerTickResult:
        result = RunnerTickResult(at=datetime.now(), signals_considered=0, signals_taken=0)

        gov_state = self.strategy.governor.state
        if gov_state.locked:
            result.cycle_locked = True
            result.reason_no_trade = f"cycle locked: {gov_state.lock_reason}"
            self._history.append(result)
            return result

        bars = self.feed.latest_bars(self.config.universe)
        signals = self.strategy.generate_signals(bars, self.config.universe)
        result.signals_considered = len(signals)

        for sig in signals[: self.config.max_trades_per_tick]:
            rt = self.engine.run_signal(sig)
            if rt is not None and rt.entry_order.status.value == "FILLED":
                result.signals_taken += 1
                result.round_trips.append(rt)

        if not signals:
            result.reason_no_trade = "no ladder-tradable candidates"

        self._history.append(result)
        return result

    def run_ticks(self, n: int) -> List[RunnerTickResult]:
        return [self.tick() for _ in range(n)]

    @property
    def history(self) -> List[RunnerTickResult]:
        return list(self._history)


def from_config(
    config: LiveRunnerConfig,
    feed: MarketDataFeed,
    chain_provider: OptionChainProvider,
    broker: Optional[LadderBroker] = None,
    alerter: Optional[AlertChannel] = None,
    scorer: Any = None,
) -> LadderLiveRunner:
    """Build a fully-wired LadderLiveRunner from a config + feed + chain.

    - broker defaults to PaperBroker(chain_provider).
    - alerter defaults to LogAlertChannel().
    - scorer, if supplied, replaces the transparent-weights scorer with
      any object exposing the same score_candidate/rank API (typically
      ladderbot.ml.CalibratedLadderScorer).
    """
    init_db(config.db_path)
    cycle_repo = CycleRepository(config.db_path)
    slip_repo  = TraceSlipRepository(config.db_path)
    order_repo = OrderRepository(config.db_path)

    strategy = LadderStrategy({
        "starting_capital": config.starting_capital,
        "per_option_target_dollars": config.per_option_target_dollars,
        "universe": config.universe,
        "option_context_provider": chain_provider_to_option_context(
            chain_provider, target_delta=config.target_delta,
        ),
    })
    if scorer is not None:
        strategy.scorer = scorer

    strategy.governor = open_or_resume(
        cycle_repo,
        starting_capital=config.starting_capital,
        per_option_target_dollars=config.per_option_target_dollars,
    )

    broker = broker or PaperBroker(chain_provider=chain_provider)
    exec_engine = LadderExecutionEngine(
        strategy=strategy, broker=broker,
        chain_provider=chain_provider, target_delta=config.target_delta,
    )
    persistent = PersistentEngine(
        engine=exec_engine, cycle_id=strategy.governor.cycle_id,
        slip_repo=slip_repo, order_repo=order_repo,
    )
    alerter = alerter or LogAlertChannel()
    guarded = GuardedEngine(inner=persistent,
                            guard=TradingGuard(config.risk_limits),
                            alerter=alerter)

    alerter.emit(make_alert(
        "runner_started",
        f"LadderLiveRunner up: cycle={strategy.governor.cycle_id}, "
        f"trade {strategy.governor.state.trade_count}/12",
        AlertSeverity.INFO,
        starting_capital=config.starting_capital,
        universe=list(config.universe),
    ))

    return LadderLiveRunner(
        strategy=strategy, engine=guarded, feed=feed,
        cycle_repo=cycle_repo, slip_repo=slip_repo, order_repo=order_repo,
        alerter=alerter, config=config,
    )
