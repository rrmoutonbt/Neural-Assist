"""Smoke tests for the ladderbot.api Flask Blueprint (Sprint 10, Day 1)."""

import json
import os
import sqlite3
import tempfile
from datetime import datetime

import pytest

from ladderbot.api import LadderApiConfig, configure, create_ladder_app


# ---------------------------------------------------------------------------
# Fixtures: empty env, populated env with a small DB + report.json
# ---------------------------------------------------------------------------

@pytest.fixture
def empty_env(tmp_path):
    cfg = LadderApiConfig(
        db_path=str(tmp_path / "does-not-exist.db"),
        report_dir=str(tmp_path / "no-such-dir"),
    )
    app = create_ladder_app(cfg)
    return app.test_client()


@pytest.fixture
def populated_env(tmp_path):
    db_path = str(tmp_path / "ladder.db")
    report_dir = str(tmp_path / "run")
    os.makedirs(report_dir, exist_ok=True)
    _seed_db(db_path)
    _seed_report(os.path.join(report_dir, "report.json"))
    cfg = LadderApiConfig(db_path=db_path, report_dir=report_dir)
    app = create_ladder_app(cfg)
    return app.test_client()


def _seed_db(path: str) -> None:
    """Create the minimal schema + one active cycle + a couple of trades."""
    conn = sqlite3.connect(path)
    try:
        conn.executescript("""
            CREATE TABLE cycles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                starting_capital REAL NOT NULL,
                current_capital REAL NOT NULL,
                peak_capital REAL NOT NULL,
                per_option_target_dollars REAL NOT NULL,
                trade_count INTEGER NOT NULL DEFAULT 0,
                realized_pnl REAL NOT NULL DEFAULT 0,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                locked INTEGER NOT NULL DEFAULT 0,
                lock_reason TEXT,
                is_active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE cycle_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cycle_id INTEGER NOT NULL,
                trade_number INTEGER NOT NULL,
                pnl_dollars REAL NOT NULL,
                capital_after REAL NOT NULL,
                at TEXT NOT NULL,
                meta_json TEXT
            );
            CREATE TABLE trace_slips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cycle_id INTEGER NOT NULL,
                cycle_trade_number INTEGER,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                contracts INTEGER NOT NULL,
                entry_price_points REAL NOT NULL,
                target_price_points REAL NOT NULL,
                stop_price_points REAL,
                delta REAL, expiration TEXT, days_to_expiration INTEGER,
                entry_fill_points REAL, exit_fill_points REAL,
                entry_ticket_id TEXT, exit_ticket_id TEXT,
                entry_time TEXT, exit_time TEXT,
                ladder_score REAL,
                realized_pnl_dollars REAL,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL UNIQUE,
                client_order_id TEXT NOT NULL UNIQUE,
                slip_id INTEGER,
                symbol TEXT NOT NULL,
                option_type TEXT NOT NULL,
                strike REAL NOT NULL,
                expiration TEXT NOT NULL,
                side TEXT NOT NULL,
                contracts INTEGER NOT NULL,
                limit_price REAL,
                status TEXT NOT NULL,
                reject_reason TEXT,
                submitted_at TEXT,
                completed_at TEXT,
                ladder_score REAL,
                cycle_trade_number INTEGER
            );
        """)
        now = datetime.now().isoformat()
        conn.execute("""INSERT INTO cycles
            (starting_capital, current_capital, peak_capital,
             per_option_target_dollars, trade_count, realized_pnl,
             started_at, locked, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)""",
            (20_000.0, 20_450.0, 20_450.0, 225.0, 2, 450.0, now))
        cycle_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for i, pnl in enumerate([225.0, 225.0], start=1):
            conn.execute("""INSERT INTO cycle_trades
                (cycle_id, trade_number, pnl_dollars, capital_after, at, meta_json)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (cycle_id, i, pnl, 20_000 + pnl * i, now,
                 json.dumps({"symbol": "CL"})))
        conn.execute("""INSERT INTO trace_slips
            (cycle_id, cycle_trade_number, symbol, side, contracts,
             entry_price_points, target_price_points, delta,
             days_to_expiration, entry_fill_points, exit_fill_points,
             entry_time, exit_time, ladder_score, realized_pnl_dollars,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (cycle_id, 1, "CL", "CALL", 5, 84.0, 106.5, 0.38, 45,
             84.0, 106.5, now, now, 96.0, 1125.0, now, now))
        conn.commit()
    finally:
        conn.close()


def _seed_report(path: str) -> None:
    report = {
        "generated_at": "2026-08-01T16:12:28Z",
        "training": {
            "n_train": 1392, "n_test": 464, "base_rate": 0.58,
            "test_accuracy": 0.47, "test_brier": 0.25, "test_auc": 0.565,
            "cv_fold_aucs": [0.50, 0.54, 0.49],
        },
        "single_pass_backtest": {
            "n_trades": 269, "n_hits": 223, "hit_rate": 0.829,
            "total_pnl": -337435.0, "avg_pnl_per_trade": -1254.4,
            "cycles_completed": 22,
            "by_symbol": {"CL": {"n": 15, "hits": 0, "pnl": 322.0, "hit_rate": 0.0}},
            "monthly_hits": {"5": 31, "6": 23, "7": 23},
            "profile": {
                "observed": {"5": 31, "6": 23},
                "expected": {"5": 10, "6": 12},
                "diff":     {"5": 21, "6": 11},
                "correlation_with_transcript": 0.225,
                "total_observed": 269, "total_expected": 120,
            },
        },
        "gate_sweep": [
            {"gate": 60, "n_trades": 269, "n_hits": 223, "hit_rate": 0.829, "total_pnl": -337435.0},
            {"gate": 70, "n_trades": 19,  "n_hits": 19,  "hit_rate": 1.0,   "total_pnl": 19000.0},
        ],
        "walk_forward": {"windows": [], "combined_hit_rate": 0.0,
                         "combined_pnl": 0.0, "combined_profile_correlation": None},
        "config": {"symbols": ["CL", "NQ", "ES", "ZS"], "gate": 60.0,
                   "per_option_target": 200.0, "contracts": 5},
    }
    with open(path, "w") as fh:
        json.dump(report, fh)


# ---------------------------------------------------------------------------
# Empty state: every endpoint must return a well-shaped body, never 500.
# ---------------------------------------------------------------------------

def test_health_empty(empty_env):
    r = empty_env.get("/api/ladder/health")
    assert r.status_code == 200
    body = r.get_json()
    assert body["ok"] is True
    assert body["db_exists"] is False
    assert body["report_exists"] is False


def test_snapshot_empty(empty_env):
    r = empty_env.get("/api/ladder/snapshot")
    assert r.status_code == 200
    body = r.get_json()
    assert body["empty"] is True
    assert body["cycle"] is None
    assert body["trades"] == []


def test_report_summary_empty(empty_env):
    r = empty_env.get("/api/ladder/report/summary")
    assert r.status_code == 200
    body = r.get_json()
    assert body["empty"] is True and body["summary"] is None


def test_gate_sweep_empty(empty_env):
    r = empty_env.get("/api/ladder/gate-sweep")
    assert r.status_code == 200
    assert r.get_json() == {"empty": True, "sweep": []}


def test_report_missing_returns_404(empty_env):
    r = empty_env.get("/api/ladder/report")
    assert r.status_code == 404
    assert r.get_json()["error"] == "no_report_available"


# ---------------------------------------------------------------------------
# Populated state: real data flows through unchanged.
# ---------------------------------------------------------------------------

def test_snapshot_returns_active_cycle(populated_env):
    r = populated_env.get("/api/ladder/snapshot")
    assert r.status_code == 200
    body = r.get_json()
    assert body["empty"] is False
    c = body["cycle"]
    assert c["cycle_id"] > 0
    assert c["trade_count"] == 2
    assert c["trades_remaining"] == 10
    assert c["cycle_max"] == 12
    assert c["locked"] is False
    assert len(c["trades"]) == 2
    assert c["trades"][0]["meta"]["symbol"] == "CL"


def test_trades_endpoint_returns_slip(populated_env):
    r = populated_env.get("/api/ladder/trades?symbol=CL&limit=5")
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 1
    assert body["trades"][0]["symbol"] == "CL"
    assert body["trades"][0]["ladder_score"] == 96.0
    assert body["trades"][0]["realized_pnl_dollars"] == 1125.0


def test_report_summary_populated(populated_env):
    r = populated_env.get("/api/ladder/report/summary")
    assert r.status_code == 200
    body = r.get_json()
    assert body["empty"] is False
    s = body["summary"]
    assert s["test_auc"] == 0.565
    assert s["gate_used"] == 60.0
    assert s["hit_rate"] == 0.829


def test_gate_sweep_populated(populated_env):
    r = populated_env.get("/api/ladder/gate-sweep")
    body = r.get_json()
    assert body["empty"] is False
    assert len(body["sweep"]) == 2
    assert body["sweep"][1]["hit_rate"] == 1.0


def test_monthly_profile_populated(populated_env):
    r = populated_env.get("/api/ladder/monthly-profile")
    body = r.get_json()
    assert body["empty"] is False
    p = body["profile"]
    assert p["correlation"] == 0.225
    # JSON always stringifies dict keys.
    assert p["observed"]["5"] == 31
    assert p["expected"]["6"] == 12


def test_cycles_list_and_detail(populated_env):
    lst = populated_env.get("/api/ladder/cycles?limit=10").get_json()
    assert lst["count"] == 1
    cid = lst["cycles"][0]["cycle_id"]
    detail = populated_env.get(f"/api/ladder/cycles/{cid}").get_json()
    assert detail["cycle_id"] == cid
    assert detail["trade_count"] == 2


def test_cycle_detail_missing_is_404(populated_env):
    r = populated_env.get("/api/ladder/cycles/999999")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Bars endpoint uses the ingestion loaders.
# ---------------------------------------------------------------------------

def test_bars_returns_ohlcv_payload(empty_env):
    r = empty_env.get("/api/ladder/bars/CL?years=1")
    assert r.status_code == 200
    body = r.get_json()
    assert body["symbol"] == "CL"
    assert body["source"] == "synthetic"
    assert body["n"] > 200
    first = body["candles"][0]
    for k in ("time", "open", "high", "low", "close"):
        assert k in first
    assert body["volume"][0]["value"] > 0
