"""LadderApiConfig: paths and flags for the ladder REST layer.

Set once at process start (either via app_factory.create_ladder_app or
by importing `configure` from the package). Falls back to sensible
defaults derived from the WTTracker checkout layout.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
WT_ROOT = os.path.abspath(os.path.join(BACKEND, ".."))


@dataclass
class LadderApiConfig:
    # SQLite path where the LadderLiveRunner persists cycles + trades.
    db_path: str = os.path.join(WT_ROOT, "ladder.db")
    # Directory where run_ladder_pipeline.py writes report.json + model.
    report_dir: str = os.path.join(WT_ROOT, "out", "ladder_run")
    # Optional: default bar source ("synthetic" | "yfinance") for /bars.
    bar_source: str = "synthetic"
    # Default number of years of bars to fetch when no explicit limit given.
    bars_default_years: int = 2


# Process-global config. Simple module-level singleton so route handlers
# can reach it without threading it through every request.
_config: LadderApiConfig = LadderApiConfig()


def configure(config: Optional[LadderApiConfig] = None, **overrides) -> LadderApiConfig:
    """Set the process-global LadderApiConfig.

    Passing a full config object replaces the current one. Passing
    keyword overrides mutates the current one field-by-field.
    Returns the resulting config.
    """
    global _config
    if config is not None:
        _config = config
    if overrides:
        for k, v in overrides.items():
            if not hasattr(_config, k):
                raise AttributeError(f"unknown LadderApiConfig field: {k}")
            setattr(_config, k, v)
    return _config


def current_config() -> LadderApiConfig:
    return _config
