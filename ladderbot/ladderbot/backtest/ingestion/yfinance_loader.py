"""yfinance-backed loader for futures continuous contracts.

Maps LadderBot's internal symbols (CL, NQ, ES, ZS, ...) to the
Yahoo Finance continuous-future tickers (CL=F, NQ=F, ...). Silently
degrades to an empty result when the network path is unavailable so
callers can chain a synthetic fallback.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import pandas as pd


logger = logging.getLogger(__name__)


SYMBOL_MAP: Dict[str, str] = {
    "CL": "CL=F",
    "NQ": "NQ=F",
    "ES": "ES=F",
    "GC": "GC=F",
    "ZS": "ZS=F",
    "ZW": "ZW=F",
    "ZC": "ZC=F",
    "ZO": "ZO=F",
    "SI": "SI=F",
    "NG": "NG=F",
}


class YFinanceUnavailable(RuntimeError):
    pass


@dataclass
class YFinanceLoader:
    period: str = "2y"
    interval: str = "1d"
    symbol_map: Dict[str, str] = field(default_factory=lambda: dict(SYMBOL_MAP))

    def load_symbol(self, symbol: str) -> Optional[pd.DataFrame]:
        try:
            import yfinance as yf
        except ImportError as exc:
            raise YFinanceUnavailable("yfinance is not installed") from exc

        ticker = self.symbol_map.get(symbol, symbol)
        try:
            df = yf.download(ticker, period=self.period, interval=self.interval,
                             progress=False, auto_adjust=True, threads=False)
        except Exception as exc:  # network / proxy / rate limit
            logger.warning("yfinance download failed for %s (%s): %s", symbol, ticker, exc)
            return None
        if df is None or len(df) == 0:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df = df.rename(columns={c: c.lower() if isinstance(c, str) else c for c in df.columns})
        needed = {"open", "high", "low", "close"}
        if not needed.issubset(df.columns):
            return None
        if "volume" not in df.columns:
            df["volume"] = 0
        df.index.name = "ts"
        return df[["open", "high", "low", "close", "volume"]].astype(float)

    def load_universe(self, symbols: List[str]) -> Dict[str, pd.DataFrame]:
        out: Dict[str, pd.DataFrame] = {}
        for sym in symbols:
            try:
                df = self.load_symbol(sym)
            except YFinanceUnavailable:
                raise
            except Exception as exc:
                logger.warning("skip %s: %s", sym, exc)
                continue
            if df is not None and len(df) > 0:
                out[sym] = df
        return out
