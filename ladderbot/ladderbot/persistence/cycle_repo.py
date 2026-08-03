"""CycleRepository: persist and restore CycleState + trade log."""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from ladderbot.cycle import CycleGovernor, CycleState

from .db import connect


@dataclass
class CycleRecord:
    id: int
    state: CycleState
    ended_at: Optional[str]
    is_active: bool


class CycleRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def _conn(self):
        return connect(self.db_path)

    # ---- writes ----------------------------------------------------------

    def create(self, state: CycleState) -> int:
        conn = self._conn()
        try:
            cur = conn.execute(
                """
                INSERT INTO cycles (starting_capital, current_capital, peak_capital,
                                    per_option_target_dollars, trade_count,
                                    realized_pnl, started_at, locked, lock_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (state.starting_capital, state.current_capital, state.peak_capital,
                 state.per_option_target_dollars, state.trade_count,
                 state.realized_pnl, state.started_at.isoformat(),
                 1 if state.locked else 0, state.lock_reason),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()

    def append_trade(self, cycle_id: int, trade: dict) -> None:
        conn = self._conn()
        try:
            conn.execute(
                """
                INSERT INTO cycle_trades (cycle_id, trade_number, pnl_dollars,
                                          capital_after, at, meta_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (cycle_id, int(trade["n"]), float(trade["pnl"]),
                 float(trade["capital_after"]), str(trade["at"]),
                 json.dumps({k: v for k, v in trade.items()
                             if k not in {"n", "pnl", "capital_after", "at"}})),
            )
            conn.commit()
        finally:
            conn.close()

    def update_state(self, cycle_id: int, state: CycleState) -> None:
        conn = self._conn()
        try:
            conn.execute(
                """
                UPDATE cycles
                SET current_capital = ?, peak_capital = ?, trade_count = ?,
                    realized_pnl = ?, locked = ?, lock_reason = ?
                WHERE id = ?
                """,
                (state.current_capital, state.peak_capital, state.trade_count,
                 state.realized_pnl, 1 if state.locked else 0,
                 state.lock_reason, cycle_id),
            )
            conn.commit()
        finally:
            conn.close()

    def close(self, cycle_id: int) -> None:
        conn = self._conn()
        try:
            conn.execute(
                "UPDATE cycles SET is_active = 0, ended_at = ? WHERE id = ?",
                (datetime.now().isoformat(), cycle_id),
            )
            conn.commit()
        finally:
            conn.close()

    # ---- reads -----------------------------------------------------------

    def get(self, cycle_id: int) -> Optional[CycleRecord]:
        conn = self._conn()
        try:
            row = conn.execute("SELECT * FROM cycles WHERE id = ?", (cycle_id,)).fetchone()
            if row is None:
                return None
            trades = [dict(r) for r in conn.execute(
                "SELECT * FROM cycle_trades WHERE cycle_id = ? ORDER BY trade_number",
                (cycle_id,)
            ).fetchall()]
            state = self._row_to_state(row, trades)
            return CycleRecord(id=cycle_id, state=state,
                               ended_at=row["ended_at"],
                               is_active=bool(row["is_active"]))
        finally:
            conn.close()

    def find_active(self) -> Optional[CycleRecord]:
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT * FROM cycles WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if row is None:
                return None
            trades = [dict(r) for r in conn.execute(
                "SELECT * FROM cycle_trades WHERE cycle_id = ? ORDER BY trade_number",
                (row["id"],)
            ).fetchall()]
            state = self._row_to_state(row, trades)
            return CycleRecord(id=int(row["id"]), state=state,
                               ended_at=row["ended_at"],
                               is_active=bool(row["is_active"]))
        finally:
            conn.close()

    def restore_governor(self, cycle_id: int) -> CycleGovernor:
        rec = self.get(cycle_id)
        if rec is None:
            raise KeyError(f"no cycle with id={cycle_id}")
        gov = CycleGovernor(
            starting_capital=rec.state.starting_capital,
            per_option_target_dollars=rec.state.per_option_target_dollars,
        )
        gov.state = rec.state
        return gov

    @staticmethod
    def _row_to_state(row, trade_rows) -> CycleState:
        trades = []
        for t in trade_rows:
            meta = json.loads(t["meta_json"] or "{}")
            trades.append({
                "n": t["trade_number"],
                "pnl": t["pnl_dollars"],
                "capital_after": t["capital_after"],
                "at": t["at"],
                **meta,
            })
        return CycleState(
            starting_capital=row["starting_capital"],
            current_capital=row["current_capital"],
            per_option_target_dollars=row["per_option_target_dollars"],
            trade_count=int(row["trade_count"]),
            realized_pnl=row["realized_pnl"],
            peak_capital=row["peak_capital"],
            trades=trades,
            started_at=datetime.fromisoformat(row["started_at"]),
            locked=bool(row["locked"]),
            lock_reason=row["lock_reason"],
        )
