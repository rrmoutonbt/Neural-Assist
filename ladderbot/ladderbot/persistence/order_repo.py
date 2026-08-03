"""OrderRepository: persist broker orders + fills with idempotency.

client_order_id is UNIQUE — resubmitting the same request is a no-op
and returns the existing order id, so restart-recovery can safely
re-invoke without double-booking.
"""

from typing import List, Optional

from ladderbot.execution.order import Fill, LadderOrder

from .db import connect


class OrderRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def _conn(self):
        return connect(self.db_path)

    def upsert_order(self, order: LadderOrder, slip_id: Optional[int]) -> int:
        req = order.request
        conn = self._conn()
        try:
            existing = conn.execute(
                "SELECT id FROM orders WHERE client_order_id = ?",
                (req.client_order_id,),
            ).fetchone()

            if existing:
                order_pk = int(existing["id"])
                conn.execute(
                    """
                    UPDATE orders
                    SET status = ?, reject_reason = ?, completed_at = ?
                    WHERE id = ?
                    """,
                    (
                        order.status.value, order.reject_reason,
                        order.completed_at.isoformat() if order.completed_at else None,
                        order_pk,
                    ),
                )
            else:
                cur = conn.execute(
                    """
                    INSERT INTO orders (
                        order_id, client_order_id, slip_id, symbol, option_type,
                        strike, expiration, side, contracts, limit_price,
                        status, reject_reason, submitted_at, completed_at,
                        ladder_score, cycle_trade_number
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        order.order_id, req.client_order_id, slip_id,
                        req.symbol, req.option_type, req.strike,
                        req.expiration.isoformat(), req.side.value,
                        req.contracts, req.limit_price,
                        order.status.value, order.reject_reason,
                        order.submitted_at.isoformat() if order.submitted_at else None,
                        order.completed_at.isoformat() if order.completed_at else None,
                        req.ladder_score, req.cycle_trade_number,
                    ),
                )
                order_pk = int(cur.lastrowid)

            for fill in order.fills:
                exists = conn.execute(
                    "SELECT 1 FROM fills WHERE fill_id = ?", (fill.fill_id,)
                ).fetchone()
                if exists:
                    continue
                conn.execute(
                    """
                    INSERT INTO fills (fill_id, order_id, price_points,
                                       contracts, at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (fill.fill_id, order.order_id,
                     fill.price_points, fill.contracts, fill.at.isoformat()),
                )
            conn.commit()
            return order_pk
        finally:
            conn.close()

    def list_for_slip(self, slip_id: int) -> List[dict]:
        conn = self._conn()
        try:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM orders WHERE slip_id = ? ORDER BY id", (slip_id,)
            ).fetchall()]
        finally:
            conn.close()

    def get_by_client_id(self, client_order_id: str) -> Optional[dict]:
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT * FROM orders WHERE client_order_id = ?", (client_order_id,)
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()
