"""RiskLimits + TradingGuard: hard constraints beyond the 12-trade cap.

Rules encoded (all configurable):
  1. Per-symbol concurrent-position cap (default 1)
  2. Total concurrent-position cap across all symbols
  3. Daily loss limit (currency)
  4. Consecutive-loss cooldown: after N losses in a row, pause for M minutes
  5. Per-cycle drawdown kill (delegated to CycleGovernor)

The guard is a pure decision engine — it reads state and returns
allow/deny. Enforcement + alerting is the caller's job (see
GuardedEngine for the wiring).
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional


@dataclass
class RiskLimits:
    max_positions_per_symbol: int = 1
    max_total_open_positions: int = 3
    daily_loss_limit_dollars: Optional[float] = 1_500.0
    consecutive_losses_before_cooldown: int = 3
    cooldown_minutes: int = 60
    max_notional_pct_per_trade: float = 0.30    # cap notional exposure per trade


@dataclass
class GuardDecision:
    allowed: bool
    reason: str
    triggered_rule: Optional[str] = None
    metadata: Dict[str, object] = field(default_factory=dict)


@dataclass
class _OpenPosition:
    symbol: str
    side: str
    contracts: int
    notional_dollars: float
    opened_at: datetime


@dataclass
class _RealizedTrade:
    symbol: str
    pnl_dollars: float
    at: datetime


class TradingGuard:
    def __init__(self, limits: Optional[RiskLimits] = None):
        self.limits = limits or RiskLimits()
        self._open: List[_OpenPosition] = []
        self._realized: List[_RealizedTrade] = []
        self._cooldown_until: Optional[datetime] = None

    # ---- state mutators (call these from the engine wrapper) ------------

    def record_open(self, symbol: str, side: str, contracts: int,
                    notional_dollars: float) -> None:
        self._open.append(_OpenPosition(
            symbol=symbol, side=side, contracts=contracts,
            notional_dollars=notional_dollars, opened_at=datetime.now(),
        ))

    def record_close(self, symbol: str, pnl_dollars: float) -> None:
        # Remove one matching open position (FIFO).
        for i, pos in enumerate(self._open):
            if pos.symbol == symbol:
                del self._open[i]
                break
        now = datetime.now()
        self._realized.append(_RealizedTrade(symbol=symbol,
                                             pnl_dollars=pnl_dollars, at=now))
        # Consecutive-loss cooldown check.
        recent = [t for t in self._realized[-self.limits.consecutive_losses_before_cooldown:]]
        if (len(recent) == self.limits.consecutive_losses_before_cooldown
                and all(t.pnl_dollars < 0 for t in recent)):
            self._cooldown_until = now + timedelta(minutes=self.limits.cooldown_minutes)

    # ---- decision ------------------------------------------------------

    def check_trade(
        self,
        symbol: str,
        contracts: int,
        premium_dollars_per_contract: float,
        current_capital: float,
        now: Optional[datetime] = None,
    ) -> GuardDecision:
        now = now or datetime.now()

        if self._cooldown_until and now < self._cooldown_until:
            return GuardDecision(
                allowed=False,
                reason=f"in cooldown until {self._cooldown_until.isoformat()}",
                triggered_rule="cooldown",
                metadata={"until": self._cooldown_until.isoformat()},
            )

        per_symbol = sum(1 for p in self._open if p.symbol == symbol)
        if per_symbol >= self.limits.max_positions_per_symbol:
            return GuardDecision(
                allowed=False,
                reason=f"per-symbol cap ({self.limits.max_positions_per_symbol}) hit for {symbol}",
                triggered_rule="max_positions_per_symbol",
                metadata={"symbol": symbol, "open": per_symbol},
            )

        if len(self._open) >= self.limits.max_total_open_positions:
            return GuardDecision(
                allowed=False,
                reason=f"total open positions cap ({self.limits.max_total_open_positions}) hit",
                triggered_rule="max_total_open_positions",
                metadata={"open": len(self._open)},
            )

        notional = contracts * premium_dollars_per_contract
        if current_capital > 0:
            frac = notional / current_capital
            if frac > self.limits.max_notional_pct_per_trade:
                return GuardDecision(
                    allowed=False,
                    reason=f"trade notional {frac:.1%} exceeds cap "
                           f"{self.limits.max_notional_pct_per_trade:.0%}",
                    triggered_rule="max_notional_pct_per_trade",
                    metadata={"notional": notional, "capital": current_capital,
                              "fraction": frac},
                )

        if self.limits.daily_loss_limit_dollars is not None:
            today = now.date()
            todays_pnl = sum(t.pnl_dollars for t in self._realized
                             if t.at.date() == today)
            if todays_pnl <= -abs(self.limits.daily_loss_limit_dollars):
                return GuardDecision(
                    allowed=False,
                    reason=f"daily loss {todays_pnl:.2f} breached limit "
                           f"{-abs(self.limits.daily_loss_limit_dollars):.2f}",
                    triggered_rule="daily_loss_limit",
                    metadata={"today_pnl": todays_pnl},
                )

        return GuardDecision(allowed=True, reason="ok")

    # ---- observability -------------------------------------------------

    def snapshot(self) -> Dict[str, object]:
        today = date.today()
        return {
            "open_positions": [
                {"symbol": p.symbol, "side": p.side, "contracts": p.contracts,
                 "notional": p.notional_dollars, "opened_at": p.opened_at.isoformat()}
                for p in self._open
            ],
            "open_count": len(self._open),
            "todays_realized_pnl": sum(
                t.pnl_dollars for t in self._realized if t.at.date() == today
            ),
            "recent_trades": [
                {"symbol": t.symbol, "pnl": t.pnl_dollars, "at": t.at.isoformat()}
                for t in self._realized[-10:]
            ],
            "cooldown_until": (self._cooldown_until.isoformat()
                               if self._cooldown_until else None),
            "limits": {
                "max_positions_per_symbol": self.limits.max_positions_per_symbol,
                "max_total_open_positions": self.limits.max_total_open_positions,
                "daily_loss_limit_dollars": self.limits.daily_loss_limit_dollars,
                "consecutive_losses_before_cooldown":
                    self.limits.consecutive_losses_before_cooldown,
                "cooldown_minutes": self.limits.cooldown_minutes,
                "max_notional_pct_per_trade": self.limits.max_notional_pct_per_trade,
            },
        }
