"""Read-only state service.

Wraps ladder.db + report.json access behind a small class so route
handlers stay thin and testable. Never mutates disk state.
"""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class State:
    db_path: str
    report_dir: str

    # ---- ladder.db ---------------------------------------------------

    def _conn(self) -> Optional[sqlite3.Connection]:
        if not os.path.isfile(self.db_path):
            return None
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def active_cycle(self) -> Optional[Dict[str, Any]]:
        conn = self._conn()
        if conn is None:
            return None
        try:
            row = conn.execute(
                "SELECT * FROM cycles WHERE is_active = 1 "
                "ORDER BY id DESC LIMIT 1"
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def cycle(self, cycle_id: int) -> Optional[Dict[str, Any]]:
        conn = self._conn()
        if conn is None:
            return None
        try:
            row = conn.execute("SELECT * FROM cycles WHERE id = ?",
                               (cycle_id,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def cycle_trades(self, cycle_id: int) -> List[Dict[str, Any]]:
        conn = self._conn()
        if conn is None:
            return []
        try:
            rows = conn.execute(
                "SELECT * FROM cycle_trades WHERE cycle_id = ? "
                "ORDER BY trade_number",
                (cycle_id,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def cycles(self, limit: int = 20) -> List[Dict[str, Any]]:
        conn = self._conn()
        if conn is None:
            return []
        try:
            rows = conn.execute(
                "SELECT * FROM cycles ORDER BY id DESC LIMIT ?",
                (int(limit),),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def slips(self, cycle_id: Optional[int] = None,
              symbol: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self._conn()
        if conn is None:
            return []
        try:
            clauses, params = [], []
            if cycle_id is not None:
                clauses.append("cycle_id = ?"); params.append(int(cycle_id))
            if symbol is not None:
                clauses.append("symbol = ?");  params.append(symbol)
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            sql = f"SELECT * FROM trace_slips {where} ORDER BY id DESC LIMIT ?"
            params.append(int(limit))
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def orders_for_slip(self, slip_id: int) -> List[Dict[str, Any]]:
        conn = self._conn()
        if conn is None:
            return []
        try:
            rows = conn.execute(
                "SELECT * FROM orders WHERE slip_id = ? ORDER BY id",
                (int(slip_id),),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    # ---- report.json -------------------------------------------------

    def report(self) -> Optional[Dict[str, Any]]:
        path = os.path.join(self.report_dir, "report.json")
        if not os.path.isfile(path):
            return None
        try:
            with open(path) as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            return None

    def report_exists(self) -> bool:
        return os.path.isfile(os.path.join(self.report_dir, "report.json"))

    def db_exists(self) -> bool:
        return os.path.isfile(self.db_path)
