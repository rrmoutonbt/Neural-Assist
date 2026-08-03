"""Black-Scholes-Merton pricing, greeks, and IV solver.

Sufficient for equity/index futures options at Sprint 2 fidelity.
Futures-option Black-76 differs only in the drift term; we expose a
`cost_of_carry` argument so callers can pick r (equity), 0 (futures),
or r - q (dividend-paying).
"""

from dataclasses import dataclass
from math import log, sqrt, exp, pi
from typing import Optional

import numpy as np
from scipy.stats import norm


SQRT_2PI = sqrt(2 * pi)


@dataclass(frozen=True)
class Greeks:
    price: float
    delta: float
    gamma: float
    theta: float          # per calendar day
    vega: float           # per 1 vol point (0.01)
    rho: float


def _d1_d2(S: float, K: float, T: float, r: float, sigma: float, b: float):
    if T <= 0 or sigma <= 0:
        raise ValueError("T and sigma must be positive")
    vt = sigma * sqrt(T)
    d1 = (log(S / K) + (b + 0.5 * sigma * sigma) * T) / vt
    d2 = d1 - vt
    return d1, d2, vt


def bs_price(S: float, K: float, T: float, r: float, sigma: float,
             option_type: str = "call", cost_of_carry: Optional[float] = None) -> float:
    b = cost_of_carry if cost_of_carry is not None else r
    d1, d2, _ = _d1_d2(S, K, T, r, sigma, b)
    if option_type == "call":
        return S * exp((b - r) * T) * norm.cdf(d1) - K * exp(-r * T) * norm.cdf(d2)
    return K * exp(-r * T) * norm.cdf(-d2) - S * exp((b - r) * T) * norm.cdf(-d1)


def bs_greeks(S: float, K: float, T: float, r: float, sigma: float,
              option_type: str = "call", cost_of_carry: Optional[float] = None) -> Greeks:
    b = cost_of_carry if cost_of_carry is not None else r
    d1, d2, vt = _d1_d2(S, K, T, r, sigma, b)
    e_bT = exp((b - r) * T)
    e_rT = exp(-r * T)
    n_d1 = norm.pdf(d1)

    if option_type == "call":
        price = S * e_bT * norm.cdf(d1) - K * e_rT * norm.cdf(d2)
        delta = e_bT * norm.cdf(d1)
        rho = K * T * e_rT * norm.cdf(d2) / 100.0
        theta_annual = (-S * e_bT * n_d1 * sigma / (2 * sqrt(T))
                        - (b - r) * S * e_bT * norm.cdf(d1)
                        - r * K * e_rT * norm.cdf(d2))
    else:
        price = K * e_rT * norm.cdf(-d2) - S * e_bT * norm.cdf(-d1)
        delta = e_bT * (norm.cdf(d1) - 1.0)
        rho = -K * T * e_rT * norm.cdf(-d2) / 100.0
        theta_annual = (-S * e_bT * n_d1 * sigma / (2 * sqrt(T))
                        + (b - r) * S * e_bT * norm.cdf(-d1)
                        + r * K * e_rT * norm.cdf(-d2))

    gamma = e_bT * n_d1 / (S * sigma * sqrt(T))
    vega  = S * e_bT * n_d1 * sqrt(T) / 100.0
    theta = theta_annual / 365.0

    return Greeks(price=price, delta=delta, gamma=gamma, theta=theta, vega=vega, rho=rho)


def implied_volatility(price: float, S: float, K: float, T: float, r: float,
                       option_type: str = "call", cost_of_carry: Optional[float] = None,
                       tol: float = 1e-6, max_iter: int = 100) -> float:
    """Newton-Raphson IV solver with a bisection fallback."""
    b = cost_of_carry if cost_of_carry is not None else r
    intrinsic = max(0.0, (S - K) if option_type == "call" else (K - S)) * exp(-r * T)
    if price <= intrinsic:
        return float("nan")

    sigma = 0.5
    for _ in range(max_iter):
        try:
            g = bs_greeks(S, K, T, r, sigma, option_type, cost_of_carry=b)
        except ValueError:
            break
        diff = g.price - price
        if abs(diff) < tol:
            return sigma
        v = g.vega * 100.0
        if v < 1e-8:
            break
        sigma = max(1e-4, sigma - diff / v)
        if sigma > 5.0:
            sigma = 5.0

    lo, hi = 1e-4, 5.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        try:
            p = bs_price(S, K, T, r, mid, option_type, cost_of_carry=b)
        except ValueError:
            return float("nan")
        if abs(p - price) < tol:
            return mid
        if p < price:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)
