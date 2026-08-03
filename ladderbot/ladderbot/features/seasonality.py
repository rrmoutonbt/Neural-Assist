"""Seasonality edge factors from historical daily returns."""

from typing import Dict

import numpy as np
import pandas as pd


def monthly_edge(df: pd.DataFrame) -> Dict[int, float]:
    """Mean daily log return by calendar month, normalized to [0, 1]."""
    logret = np.log(df["close"] / df["close"].shift(1)).dropna()
    if len(logret) == 0:
        return {}
    by_month = logret.groupby(logret.index.month).mean()
    lo, hi = float(by_month.min()), float(by_month.max())
    if hi == lo:
        return {int(m): 0.5 for m in by_month.index}
    return {int(m): float((v - lo) / (hi - lo)) for m, v in by_month.items()}


def dow_edge(df: pd.DataFrame) -> Dict[int, float]:
    """Mean daily log return by day-of-week (Mon=0), normalized to [0, 1]."""
    logret = np.log(df["close"] / df["close"].shift(1)).dropna()
    if len(logret) == 0:
        return {}
    by_dow = logret.groupby(logret.index.dayofweek).mean()
    lo, hi = float(by_dow.min()), float(by_dow.max())
    if hi == lo:
        return {int(d): 0.5 for d in by_dow.index}
    return {int(d): float((v - lo) / (hi - lo)) for d, v in by_dow.items()}


def seasonality_score(df: pd.DataFrame, when: pd.Timestamp) -> float:
    """Combined monthly + DoW score in [0, 1]."""
    m = monthly_edge(df).get(when.month, 0.5)
    d = dow_edge(df).get(when.dayofweek, 0.5)
    return 0.6 * m + 0.4 * d
