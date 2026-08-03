"""Deterministic multi-regime bar generator for offline demos + CI.

Produces multi-year OHLCV series with:
  - regime-switching drift (bull, bear, chop, crisis)
  - volatility clustering (GARCH-like)
  - realistic intra-bar range as function of realized vol
  - per-symbol seeds so runs are reproducible

Not a substitute for real market data — this is scaffolding to
exercise the full pipeline until a real feed is wired.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd


@dataclass
class RegimeSpec:
    name: str
    drift_daily: float
    vol_daily: float
    min_days: int = 20
    max_days: int = 60


DEFAULT_REGIMES: List[RegimeSpec] = [
    RegimeSpec("bull_slow",  drift_daily=+0.0015, vol_daily=0.010),
    RegimeSpec("bull_strong",drift_daily=+0.0040, vol_daily=0.014),
    RegimeSpec("chop",       drift_daily=+0.0002, vol_daily=0.009),
    RegimeSpec("bear_slow",  drift_daily=-0.0015, vol_daily=0.012),
    RegimeSpec("bear_strong",drift_daily=-0.0040, vol_daily=0.018),
    RegimeSpec("crisis",     drift_daily=-0.0060, vol_daily=0.030, min_days=10, max_days=25),
]


@dataclass
class SyntheticHistoryLoader:
    years: int = 3
    regimes: List[RegimeSpec] = field(default_factory=lambda: list(DEFAULT_REGIMES))
    start: str = "2023-01-01"

    def _seed_for(self, symbol: str, master_seed: int) -> int:
        return (master_seed * 1_000_003 + sum(ord(c) for c in symbol)) & 0x7FFFFFFF

    def load_symbol(self, symbol: str, start_price: float = 100.0,
                    master_seed: int = 42) -> pd.DataFrame:
        rng = np.random.default_rng(self._seed_for(symbol, master_seed))
        days = self.years * 252
        r = np.empty(days)
        idx = 0
        while idx < days:
            regime = self.regimes[rng.integers(0, len(self.regimes))]
            block_len = int(rng.integers(regime.min_days, regime.max_days + 1))
            block_len = min(block_len, days - idx)
            # GARCH-lite: each day's vol wiggles around the regime vol.
            vol_walk = regime.vol_daily * (1 + 0.35 * rng.standard_normal(block_len).cumsum() / np.sqrt(block_len))
            vol_walk = np.clip(vol_walk, regime.vol_daily * 0.4, regime.vol_daily * 2.5)
            r[idx:idx + block_len] = rng.normal(regime.drift_daily, vol_walk, block_len)
            idx += block_len

        close = start_price * np.exp(np.cumsum(r))
        # Intraday range scales with local realized vol.
        realized = pd.Series(r).rolling(5).std().bfill().to_numpy()
        wick = np.abs(rng.normal(0, 1, days)) * realized * close * 0.6
        high = close + wick * rng.uniform(0.3, 0.7, days)
        low  = close - wick * rng.uniform(0.3, 0.7, days)
        open_ = np.roll(close, 1); open_[0] = start_price
        volume = rng.integers(20_000, 200_000, days)

        idx_range = pd.bdate_range(self.start, periods=days, freq="B")
        return pd.DataFrame({
            "open": open_, "high": high, "low": low,
            "close": close, "volume": volume,
        }, index=pd.DatetimeIndex(idx_range, name="ts"))

    def load_universe(self, symbols: List[str],
                      start_prices: Optional[Dict[str, float]] = None,
                      master_seed: int = 42) -> Dict[str, pd.DataFrame]:
        start_prices = start_prices or {}
        return {
            s: self.load_symbol(s, start_price=start_prices.get(s, 100.0),
                                master_seed=master_seed)
            for s in symbols
        }
