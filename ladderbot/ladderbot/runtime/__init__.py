"""LadderBot runtime layer.

Public surface:
    - LadderLiveRunner: one-object orchestrator that composes strategy,
      guarded engine, persistence, alerts, and market data feed into a
      tick loop.
    - MarketDataFeed protocol: pull-mode interface any adapter must
      implement (yields {symbol: OHLCV DataFrame} on each tick).
    - from_config: factory that builds the full runtime stack from a
      config dict, mirroring the Sprint 1 preset shape.
"""

from .live_runner import (
    LadderLiveRunner,
    LiveRunnerConfig,
    MarketDataFeed,
    RunnerTickResult,
    from_config,
)

__all__ = [
    "LadderLiveRunner", "LiveRunnerConfig", "MarketDataFeed",
    "RunnerTickResult", "from_config",
]
