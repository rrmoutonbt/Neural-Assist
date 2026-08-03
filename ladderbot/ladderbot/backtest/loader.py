"""Bar data loader for the backtest harness.

Reads OHLCV bars from a directory of CSV files, one per symbol
(named `{symbol}.csv`), with columns: date, open, high, low, close,
volume. Accepts either a `date` or a `timestamp` column.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

import pandas as pd


@dataclass
class BarLoader:
    root: str

    def load_symbol(self, symbol: str) -> Optional[pd.DataFrame]:
        for name in (f"{symbol}.csv", f"{symbol.upper()}.csv"):
            path = os.path.join(self.root, name)
            if os.path.isfile(path):
                return self._read_csv(path)
        return None

    def load_universe(self, symbols: Iterable[str]) -> Dict[str, pd.DataFrame]:
        out: Dict[str, pd.DataFrame] = {}
        for sym in symbols:
            df = self.load_symbol(sym)
            if df is not None:
                out[sym] = df
        return out

    def available_symbols(self) -> List[str]:
        if not os.path.isdir(self.root):
            return []
        return sorted(
            os.path.splitext(f)[0]
            for f in os.listdir(self.root)
            if f.lower().endswith(".csv")
        )

    @staticmethod
    def _read_csv(path: str) -> pd.DataFrame:
        df = pd.read_csv(path)
        cols = {c.lower(): c for c in df.columns}
        ts_col = cols.get("date") or cols.get("timestamp") or cols.get("time")
        if ts_col is None:
            raise ValueError(f"{path}: no date/timestamp column")
        df = df.rename(columns={ts_col: "ts"})
        df["ts"] = pd.to_datetime(df["ts"])
        df = df.set_index("ts").sort_index()
        needed = {"open", "high", "low", "close"}
        missing = needed - {c.lower() for c in df.columns}
        if missing:
            raise ValueError(f"{path}: missing columns {missing}")
        df.columns = [c.lower() for c in df.columns]
        if "volume" not in df.columns:
            df["volume"] = 0
        return df[["open", "high", "low", "close", "volume"]]
