"""LadderStrategy: TradingStrategy subclass gluing the scorer, sizing,
and 12-trade governor into the existing bee_bot strategy contract.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from ladderbot._base import (
    StrategySignal,
    TradingSignal,
    TradingStrategy,
)
from ladderbot.cycle import CycleGovernor
from ladderbot.instruments import INSTRUMENTS, get as get_instrument
from ladderbot.scorer import LadderScorer, LADDER_GATE
from ladderbot.trace_slip import TraceSlip


class LadderStrategy(TradingStrategy):
    """Futures-options strategy modeled on Ms. Juanita's ladder method."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__("Ladder", config)
        self.per_option_target = float(config.get("per_option_target_dollars", 225.0))
        self.starting_capital = float(config.get("starting_capital", 20_000.0))
        self.capital_utilization = float(config.get("capital_utilization", 0.84))
        self.max_drawdown_pct = float(config.get("max_drawdown_pct", 0.20))
        self.universe = config.get("universe", list(INSTRUMENTS.keys()))
        self.option_context_provider = config.get("option_context_provider")

        self.scorer = LadderScorer(weights=config.get("ladder_weights"))
        self.governor = CycleGovernor(
            starting_capital=self.starting_capital,
            per_option_target_dollars=self.per_option_target,
            max_drawdown_pct=self.max_drawdown_pct,
        )
        self.open_slips: List[TraceSlip] = []

    def generate_signals(
        self, market_data: Dict[str, pd.DataFrame], universe: List[str]
    ) -> List[TradingSignal]:
        can_trade, reason = self.governor.can_open_trade()
        if not can_trade:
            return []

        symbols = [s for s in (universe or self.universe) if s in market_data and s in INSTRUMENTS]
        candidates = []
        for symbol in symbols:
            df = market_data[symbol]
            for side in ("CALL", "PUT"):
                opt_ctx = self._option_context(symbol, side, df)
                cand = self.scorer.score_candidate(
                    symbol=symbol,
                    side=side,
                    ohlcv=df,
                    option_context=opt_ctx,
                    dollar_target=self.per_option_target,
                )
                if cand is not None:
                    candidates.append((cand, opt_ctx))

        ranked = self.scorer.rank([c for c, _ in candidates])
        if not ranked:
            return []

        top = ranked[0]
        opt_ctx = next(ctx for cand, ctx in candidates if cand is top)

        contracts = self.governor.size_contracts(
            premium_dollars_per_contract=opt_ctx["premium_dollars"],
            capital_utilization=self.capital_utilization,
        )
        if contracts <= 0:
            return []

        instrument = get_instrument(top.symbol)
        target_move_points = instrument.dollars_to_points(self.per_option_target)

        signal = TradingSignal(
            symbol=top.symbol,
            signal=StrategySignal.STRONG_BUY if top.side == "CALL" else StrategySignal.STRONG_SELL,
            confidence=top.score / 100.0,
            strength=1.0 if top.side == "CALL" else -1.0,
            urgency=0.6,
            target_weight=(contracts * opt_ctx["premium_dollars"]) / max(self.governor.state.current_capital, 1.0),
            stop_loss=None,
            take_profit=self.per_option_target,
            holding_period=opt_ctx.get("days_to_expiration"),
            metadata={
                "strategy": "ladder",
                "side": top.side,
                "ladder_score": top.score,
                "expected_dollars_per_hour": top.expected_dollars_per_hour,
                "contracts": contracts,
                "premium_dollars": opt_ctx["premium_dollars"],
                "premium_points": opt_ctx["premium_points"],
                "target_move_points": target_move_points,
                "delta": opt_ctx.get("delta"),
                "days_to_expiration": opt_ctx.get("days_to_expiration"),
                "cycle_trade_number": self.governor.state.trade_count + 1,
                "features": top.features,
                "gate": LADDER_GATE,
            },
        )
        return [signal]

    def update_positions(
        self, current_positions: Dict[str, float], new_signals: List[TradingSignal]
    ) -> Dict[str, float]:
        updated = dict(current_positions)
        for sig in new_signals:
            weight = sig.target_weight if sig.strength >= 0 else -sig.target_weight
            updated[sig.symbol] = weight
        return updated

    def build_trace_slip(self, signal: TradingSignal) -> TraceSlip:
        m = signal.metadata
        return TraceSlip(
            symbol=signal.symbol,
            side=m["side"],
            contracts=int(m["contracts"]),
            entry_price_points=float(m["premium_points"]),
            target_price_points=float(m["premium_points"]) + float(m["target_move_points"]),
            delta=m.get("delta"),
            days_to_expiration=m.get("days_to_expiration"),
            ladder_score=m.get("ladder_score"),
            cycle_trade_number=m.get("cycle_trade_number"),
            metadata={"features": m.get("features", {})},
        )

    def record_fill_and_close(
        self,
        slip: TraceSlip,
        entry_fill_points: float,
        exit_fill_points: float,
        entry_ticket_id: Optional[str] = None,
        exit_ticket_id: Optional[str] = None,
    ) -> float:
        slip.entry_fill_points = entry_fill_points
        slip.exit_fill_points = exit_fill_points
        slip.entry_ticket_id = entry_ticket_id
        slip.exit_ticket_id = exit_ticket_id
        slip.entry_time = slip.entry_time or datetime.now()
        slip.exit_time = datetime.now()

        pnl = slip.realized_pnl_dollars or 0.0
        self.governor.record_trade(pnl_dollars=pnl, meta={
            "symbol": slip.symbol,
            "side": slip.side,
            "contracts": slip.contracts,
            "ladder_score": slip.ladder_score,
        })
        return pnl

    def _option_context(self, symbol: str, side: str, df: pd.DataFrame) -> Dict[str, Any]:
        instrument = get_instrument(symbol)
        if self.option_context_provider is not None:
            ctx = self.option_context_provider(symbol=symbol, side=side, df=df)
        else:
            ctx = {
                "delta": 0.38,
                "iv_rank": 0.4,
                "days_to_expiration": 45,
                "premium_points": instrument.typical_option_premium / instrument.dollars_per_point,
                "premium_dollars": float(instrument.typical_option_premium),
            }
        ctx.setdefault("dollars_per_point", instrument.dollars_per_point)
        return ctx
