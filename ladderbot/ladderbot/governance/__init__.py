"""LadderBot governance layer.

Public surface:
    - RiskLimits, TradingGuard, GuardDecision
    - AlertChannel protocol + LogAlertChannel, WebhookAlertChannel,
      MultiplexAlertChannel
    - dashboard_snapshot: read-only status dict for observability
    - GuardedEngine: PersistentEngine wrapper that consults the guard
"""

from .limits import RiskLimits, TradingGuard, GuardDecision
from .alerts import (
    AlertChannel, AlertEvent, AlertSeverity,
    LogAlertChannel, WebhookAlertChannel, MultiplexAlertChannel,
    make_alert,
)
from .dashboard import dashboard_snapshot, DashboardSnapshot
from .guarded_engine import GuardedEngine

__all__ = [
    "RiskLimits", "TradingGuard", "GuardDecision",
    "AlertChannel", "AlertEvent", "AlertSeverity",
    "LogAlertChannel", "WebhookAlertChannel", "MultiplexAlertChannel", "make_alert",
    "dashboard_snapshot", "DashboardSnapshot",
    "GuardedEngine",
]
