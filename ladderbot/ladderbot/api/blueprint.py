"""Flask Blueprint carrying every /api/ladder/* route.

Every handler stays thin: parse args -> hit State -> serialize -> return.
Handlers must never raise on empty state; return a well-shaped body with
an empty list / null / zero and let the frontend render an empty view.
"""

from __future__ import annotations

from typing import Any, Dict

from flask import Blueprint, jsonify, request

from .config import current_config
from .serialization import (
    bars_to_json, cycle_to_json, gate_sweep_to_json,
    monthly_profile_to_json, order_to_json, report_summary,
    slip_to_json,
)
from .state import State


ladder_bp = Blueprint("ladder", __name__, url_prefix="/api/ladder")


def _state() -> State:
    cfg = current_config()
    return State(db_path=cfg.db_path, report_dir=cfg.report_dir)


@ladder_bp.route("/health", methods=["GET"])
def health():
    cfg = current_config()
    s = _state()
    return jsonify({
        "ok": True,
        "db_exists": s.db_exists(),
        "report_exists": s.report_exists(),
        "db_path": cfg.db_path,
        "report_dir": cfg.report_dir,
    })


@ladder_bp.route("/snapshot", methods=["GET"])
def snapshot():
    """Current active cycle + its trades. Empty payload if no active cycle."""
    s = _state()
    row = s.active_cycle()
    if row is None:
        return jsonify({"cycle": None, "trades": [], "empty": True})
    trades = s.cycle_trades(int(row["id"]))
    return jsonify({"cycle": cycle_to_json(row, trades), "empty": False})


@ladder_bp.route("/cycles", methods=["GET"])
def cycles():
    """Recent cycles (default 20). For the history strip in the UI."""
    limit = _int_arg("limit", default=20, minimum=1, maximum=200)
    s = _state()
    rows = s.cycles(limit=limit)
    out = []
    for row in rows:
        trades = s.cycle_trades(int(row["id"]))
        out.append(cycle_to_json(row, trades))
    return jsonify({"cycles": out, "count": len(out)})


@ladder_bp.route("/cycles/<int:cycle_id>", methods=["GET"])
def cycle_detail(cycle_id: int):
    s = _state()
    row = s.cycle(cycle_id)
    if row is None:
        return jsonify({"error": "cycle_not_found", "cycle_id": cycle_id}), 404
    return jsonify(cycle_to_json(row, s.cycle_trades(cycle_id)))


@ladder_bp.route("/trades", methods=["GET"])
def trades():
    """Recent trace slips (optionally filter by cycle_id or symbol)."""
    s = _state()
    cycle_id = request.args.get("cycle_id", type=int)
    symbol   = request.args.get("symbol", type=str)
    limit    = _int_arg("limit", default=50, minimum=1, maximum=500)
    rows = s.slips(cycle_id=cycle_id, symbol=symbol, limit=limit)
    return jsonify({
        "trades": [slip_to_json(r) for r in rows],
        "count": len(rows),
        "filters": {"cycle_id": cycle_id, "symbol": symbol, "limit": limit},
    })


@ladder_bp.route("/trades/<int:slip_id>/orders", methods=["GET"])
def trade_orders(slip_id: int):
    s = _state()
    rows = s.orders_for_slip(slip_id)
    return jsonify({
        "slip_id": slip_id,
        "orders": [order_to_json(r) for r in rows],
        "count": len(rows),
    })


@ladder_bp.route("/report", methods=["GET"])
def report():
    """Full latest pipeline report.json (or 404 if none)."""
    r = _state().report()
    if r is None:
        return jsonify({"error": "no_report_available"}), 404
    return jsonify(r)


@ladder_bp.route("/report/summary", methods=["GET"])
def report_summary_route():
    r = _state().report()
    if r is None:
        return jsonify({"empty": True, "summary": None})
    return jsonify({"empty": False, "summary": report_summary(r)})


@ladder_bp.route("/gate-sweep", methods=["GET"])
def gate_sweep():
    r = _state().report()
    if r is None:
        return jsonify({"empty": True, "sweep": []})
    return jsonify({"empty": False, "sweep": gate_sweep_to_json(r)})


@ladder_bp.route("/monthly-profile", methods=["GET"])
def monthly_profile():
    r = _state().report()
    if r is None:
        return jsonify({"empty": True, "profile": None})
    return jsonify({"empty": False, "profile": monthly_profile_to_json(r)})


@ladder_bp.route("/bars/<symbol>", methods=["GET"])
def bars(symbol: str):
    """OHLCV payload for the frontend chart. Uses configured bar source."""
    from ladderbot.backtest.ingestion import (
        SyntheticHistoryLoader, YFinanceLoader, YFinanceUnavailable,
    )

    cfg = current_config()
    years = _int_arg("years", default=cfg.bars_default_years, minimum=1, maximum=10)
    source = request.args.get("source", default=cfg.bar_source, type=str)

    df = None
    used = source
    if source == "yfinance":
        try:
            df = YFinanceLoader(period=f"{years}y").load_symbol(symbol)
        except YFinanceUnavailable:
            df = None
    if df is None or len(df) == 0:
        df = SyntheticHistoryLoader(years=years).load_symbol(symbol)
        used = "synthetic"

    return jsonify({**bars_to_json(symbol, df), "source": used})


# ---------------------------------------------------------------------------

def _int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    val = request.args.get(name, default=default, type=int)
    if val is None:
        val = default
    return max(minimum, min(maximum, int(val)))
