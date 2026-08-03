"""Historical bar ingestion for the LadderBot backtest pipeline.

Two loaders:
  - YFinanceLoader: pulls futures continuous contracts via yfinance
    (requires outbound HTTPS to query1.finance.yahoo.com).
  - SyntheticHistoryLoader: deterministic multi-regime bars for
    offline / air-gapped demos and CI.

Both return {symbol: OHLCV DataFrame} with a datetime index.
"""

from .yfinance_loader import YFinanceLoader, YFinanceUnavailable
from .synthetic_history import SyntheticHistoryLoader, RegimeSpec

__all__ = [
    "YFinanceLoader", "YFinanceUnavailable",
    "SyntheticHistoryLoader", "RegimeSpec",
]
