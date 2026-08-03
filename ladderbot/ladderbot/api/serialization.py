"""JSON schemas returned by the ladder REST endpoints.

Keep these stable — the frontend components (LadderTable, CycleProgress,
MonthlyProfile, LadderOverlay) key off these field names.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional


def cycle_to_json(row: Dict[str, Any], trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Cycle row + its trades -> the shape LadderTable/CycleProgress needs."""
    trade_count = int(row.get("trade_count", 0))
    peak = float(row.get("peak_capital", 0.0) or 0.0)
    current = float(row.get("current_capital", 0.0) or 0.0)
    return {
        "cycle_id": int(row["id"]),
        "starting_capital": float(row["starting_capital"]),
        "current_capital": current,
        "peak_capital": peak,
        "drawdown_pct": (peak - current) / peak if peak > 0 else 0.0,
        "per_option_target_dollars": float(row["per_option_target_dollars"]),
        "realized_pnl": float(row.get("realized_pnl", 0.0) or 0.0),
        "trade_count": trade_count,
        "trades_remaining": max(0, 12 - trade_count),
        "cycle_max": 12,
        "started_at": row.get("started_at"),
        "ended_at":   row.get("ended_at"),
        "is_active":  bool(row.get("is_active", 0)),
        "locked":     bool(row.get("locked", 0)),
        "lock_reason": row.get("lock_reason"),
        "trades": [_trade_to_json(t) for t in trades],
    }


def _trade_to_json(t: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "n":             int(t["trade_number"]),
        "pnl_dollars":   float(t["pnl_dollars"]),
        "capital_after": float(t["capital_after"]),
        "at":            t["at"],
        "meta":          _parse_meta(t.get("meta_json")),
    }


def slip_to_json(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id":                   int(row["id"]),
        "cycle_id":             int(row["cycle_id"]),
        "cycle_trade_number":   row.get("cycle_trade_number"),
        "symbol":               row["symbol"],
        "side":                 row["side"],
        "contracts":            int(row["contracts"]),
        "entry_price_points":   _f(row.get("entry_price_points")),
        "target_price_points":  _f(row.get("target_price_points")),
        "entry_fill_points":    _f(row.get("entry_fill_points")),
        "exit_fill_points":     _f(row.get("exit_fill_points")),
        "entry_time":           row.get("entry_time"),
        "exit_time":            row.get("exit_time"),
        "days_to_expiration":   row.get("days_to_expiration"),
        "delta":                _f(row.get("delta")),
        "ladder_score":         _f(row.get("ladder_score")),
        "realized_pnl_dollars": _f(row.get("realized_pnl_dollars")),
        "created_at":           row.get("created_at"),
        "updated_at":           row.get("updated_at"),
    }


def order_to_json(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "order_id":         row["order_id"],
        "client_order_id":  row["client_order_id"],
        "slip_id":          row.get("slip_id"),
        "symbol":           row["symbol"],
        "option_type":      row["option_type"],
        "strike":           _f(row.get("strike")),
        "expiration":       row.get("expiration"),
        "side":             row["side"],
        "contracts":        int(row["contracts"]),
        "status":           row["status"],
        "reject_reason":    row.get("reject_reason"),
        "submitted_at":     row.get("submitted_at"),
        "completed_at":     row.get("completed_at"),
        "ladder_score":     _f(row.get("ladder_score")),
    }


def bars_to_json(symbol: str, df) -> Dict[str, Any]:
    """OHLCV DataFrame -> Lightweight-Charts-compatible payload.

    Lightweight Charts expects:
        [{time: "2024-01-01", open, high, low, close}, ...]
        [{time: "2024-01-01", value}, ...] for volume
    """
    ohlc = [
        {
            "time":  ts.strftime("%Y-%m-%d"),
            "open":  float(r.open), "high": float(r.high),
            "low":   float(r.low),  "close": float(r.close),
        }
        for ts, r in df.iterrows()
    ]
    volume = [
        {"time": ts.strftime("%Y-%m-%d"), "value": float(r.volume)}
        for ts, r in df.iterrows()
    ]
    return {"symbol": symbol, "n": len(df), "candles": ohlc, "volume": volume}


def report_summary(report: Dict[str, Any]) -> Dict[str, Any]:
    """Pipeline report.json -> tiny summary for the dashboard header."""
    sp = report.get("single_pass_backtest", {})
    tr = report.get("training", {})
    return {
        "generated_at":       report.get("generated_at"),
        "test_auc":           tr.get("test_auc"),
        "test_accuracy":      tr.get("test_accuracy"),
        "test_brier":         tr.get("test_brier"),
        "n_trades":           sp.get("n_trades"),
        "hit_rate":           sp.get("hit_rate"),
        "total_pnl":          sp.get("total_pnl"),
        "profile_correlation": (sp.get("profile") or {}).get("correlation_with_transcript"),
        "gate_used":          (report.get("config") or {}).get("gate"),
    }


def gate_sweep_to_json(report: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return the gate sweep table verbatim (already list of dicts)."""
    return list(report.get("gate_sweep") or [])


def monthly_profile_to_json(report: Dict[str, Any]) -> Dict[str, Any]:
    sp = report.get("single_pass_backtest") or {}
    profile = sp.get("profile") or {}
    return {
        "observed":              _int_dict(profile.get("observed") or {}),
        "expected":              _int_dict(profile.get("expected") or {}),
        "diff":                  _int_dict(profile.get("diff") or {}),
        "correlation":           profile.get("correlation_with_transcript"),
        "total_observed":        profile.get("total_observed"),
        "total_expected":        profile.get("total_expected"),
    }


# ---------------------------------------------------------------------------
# tiny helpers
# ---------------------------------------------------------------------------

def _f(v):
    return float(v) if v is not None else None


def _int_dict(d: Dict[Any, Any]) -> Dict[int, int]:
    out: Dict[int, int] = {}
    for k, v in d.items():
        try:
            out[int(k)] = int(v)
        except (TypeError, ValueError):
            pass
    return out


def _parse_meta(raw):
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        import json
        return json.loads(raw)
    except Exception:
        return {"_raw": str(raw)}
