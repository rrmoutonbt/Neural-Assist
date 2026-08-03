"""SQLite schema + connection helpers for the LadderBot persistence layer.

The schema is intentionally narrow: three tables (cycles, cycle_trades,
trace_slips, orders, fills) that together capture everything needed
to resume a bot after a crash without losing:
  - which cycle we're on (and whether it's locked)
  - how many of the 12 trades are done
  - the running capital and drawdown
  - every trace slip with its entry/exit fills
  - every broker order + fill for audit
"""

import os
import sqlite3
from typing import Optional


DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "ladder.db"
)


def connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS cycles (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    starting_capital          REAL NOT NULL,
    current_capital           REAL NOT NULL,
    peak_capital              REAL NOT NULL,
    per_option_target_dollars REAL NOT NULL,
    trade_count               INTEGER NOT NULL DEFAULT 0,
    realized_pnl              REAL NOT NULL DEFAULT 0,
    started_at                TEXT NOT NULL,
    ended_at                  TEXT,
    locked                    INTEGER NOT NULL DEFAULT 0,
    lock_reason               TEXT,
    is_active                 INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cycle_trades (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id       INTEGER NOT NULL,
    trade_number   INTEGER NOT NULL,
    pnl_dollars    REAL NOT NULL,
    capital_after  REAL NOT NULL,
    at             TEXT NOT NULL,
    meta_json      TEXT,
    FOREIGN KEY (cycle_id) REFERENCES cycles(id),
    UNIQUE(cycle_id, trade_number)
);

CREATE TABLE IF NOT EXISTS trace_slips (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id               INTEGER NOT NULL,
    cycle_trade_number     INTEGER,
    symbol                 TEXT NOT NULL,
    side                   TEXT NOT NULL,
    contracts              INTEGER NOT NULL,
    entry_price_points     REAL NOT NULL,
    target_price_points    REAL NOT NULL,
    stop_price_points      REAL,
    delta                  REAL,
    expiration             TEXT,
    days_to_expiration     INTEGER,
    entry_fill_points      REAL,
    exit_fill_points       REAL,
    entry_ticket_id        TEXT,
    exit_ticket_id         TEXT,
    entry_time             TEXT,
    exit_time              TEXT,
    ladder_score           REAL,
    realized_pnl_dollars   REAL,
    metadata_json          TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL,
    FOREIGN KEY (cycle_id) REFERENCES cycles(id)
);
CREATE INDEX IF NOT EXISTS idx_trace_slips_cycle ON trace_slips(cycle_id);
CREATE INDEX IF NOT EXISTS idx_trace_slips_symbol ON trace_slips(symbol);

CREATE TABLE IF NOT EXISTS orders (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id             TEXT NOT NULL UNIQUE,
    client_order_id      TEXT NOT NULL UNIQUE,
    slip_id              INTEGER,
    symbol               TEXT NOT NULL,
    option_type          TEXT NOT NULL,
    strike               REAL NOT NULL,
    expiration           TEXT NOT NULL,
    side                 TEXT NOT NULL,
    contracts            INTEGER NOT NULL,
    limit_price          REAL,
    status               TEXT NOT NULL,
    reject_reason        TEXT,
    submitted_at         TEXT,
    completed_at         TEXT,
    ladder_score         REAL,
    cycle_trade_number   INTEGER,
    FOREIGN KEY (slip_id) REFERENCES trace_slips(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_slip ON orders(slip_id);

CREATE TABLE IF NOT EXISTS fills (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    fill_id        TEXT NOT NULL UNIQUE,
    order_id       TEXT NOT NULL,
    price_points   REAL NOT NULL,
    contracts      INTEGER NOT NULL,
    at             TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);
CREATE INDEX IF NOT EXISTS idx_fills_order ON fills(order_id);
"""


def init_db(db_path: Optional[str] = None) -> None:
    path = db_path or DEFAULT_DB_PATH
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = connect(path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
