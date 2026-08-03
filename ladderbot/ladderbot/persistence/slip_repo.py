"""TraceSlipRepository: insert and update TraceSlip records."""

import json
from datetime import datetime
from typing import List, Optional

from ladderbot.trace_slip import TraceSlip

from .db import connect


class TraceSlipRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def _conn(self):
        return connect(self.db_path)

    def insert(self, cycle_id: int, slip: TraceSlip) -> int:
        now = datetime.now().isoformat()
        conn = self._conn()
        try:
            cur = conn.execute(
                """
                INSERT INTO trace_slips (
                    cycle_id, cycle_trade_number, symbol, side, contracts,
                    entry_price_points, target_price_points, stop_price_points,
                    delta, expiration, days_to_expiration,
                    entry_fill_points, exit_fill_points,
                    entry_ticket_id, exit_ticket_id, entry_time, exit_time,
                    ladder_score, realized_pnl_dollars, metadata_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cycle_id, slip.cycle_trade_number, slip.symbol, slip.side,
                    slip.contracts, slip.entry_price_points, slip.target_price_points,
                    slip.stop_price_points, slip.delta,
                    slip.expiration.isoformat() if slip.expiration else None,
                    slip.days_to_expiration,
                    slip.entry_fill_points, slip.exit_fill_points,
                    slip.entry_ticket_id, slip.exit_ticket_id,
                    slip.entry_time.isoformat() if slip.entry_time else None,
                    slip.exit_time.isoformat() if slip.exit_time else None,
                    slip.ladder_score, slip.realized_pnl_dollars,
                    json.dumps(slip.metadata or {}),
                    now, now,
                ),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()

    def update_close(self, slip_id: int, slip: TraceSlip) -> None:
        conn = self._conn()
        try:
            conn.execute(
                """
                UPDATE trace_slips
                SET entry_fill_points = ?, exit_fill_points = ?,
                    entry_ticket_id = ?, exit_ticket_id = ?,
                    entry_time = ?, exit_time = ?,
                    realized_pnl_dollars = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    slip.entry_fill_points, slip.exit_fill_points,
                    slip.entry_ticket_id, slip.exit_ticket_id,
                    slip.entry_time.isoformat() if slip.entry_time else None,
                    slip.exit_time.isoformat() if slip.exit_time else None,
                    slip.realized_pnl_dollars,
                    datetime.now().isoformat(),
                    slip_id,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def list_for_cycle(self, cycle_id: int) -> List[dict]:
        conn = self._conn()
        try:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM trace_slips WHERE cycle_id = ? ORDER BY id",
                (cycle_id,),
            ).fetchall()]
        finally:
            conn.close()
