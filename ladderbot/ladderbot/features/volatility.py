"""Volatility features: ATR, realized vol, ATR percentile, IV rank."""

from typing import Sequence

import numpy as np
import pandas as pd


def atr(df: pd.DataFrame, period: int = 14) -> float:
    """Wilder average true range, latest value."""
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        (high - low).abs(),
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return float(tr.rolling(period).mean().iloc[-1])


def realized_vol(df: pd.DataFrame, window: int = 20, annualize: int = 252) -> float:
    """Annualized realized volatility from close-to-close log returns."""
    logret = np.log(df["close"] / df["close"].shift(1)).dropna()
    if len(logret) < window:
        return float("nan")
    return float(logret.rolling(window).std().iloc[-1] * np.sqrt(annualize))


def atr_percentile(df: pd.DataFrame, period: int = 14, lookback: int = 252) -> float:
    """Where the latest ATR sits in its trailing distribution, in [0, 1]."""
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        (high - low).abs(),
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr_series = tr.rolling(period).mean().dropna()
    if len(atr_series) < 5:
        return float("nan")
    tail = atr_series.tail(lookback)
    return float((tail <= atr_series.iloc[-1]).mean())


def iv_rank(current_iv: float, iv_history: Sequence[float]) -> float:
    """Standard IV rank: (current - min) / (max - min) over the trailing series."""
    hist = np.asarray([v for v in iv_history if np.isfinite(v)], dtype=float)
    if len(hist) < 5:
        return float("nan")
    lo, hi = float(hist.min()), float(hist.max())
    if hi <= lo:
        return 0.5
    return float(np.clip((current_iv - lo) / (hi - lo), 0.0, 1.0))
