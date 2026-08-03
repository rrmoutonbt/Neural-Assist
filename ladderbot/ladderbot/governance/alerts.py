"""Alert channels for LadderBot governance events.

- AlertChannel: abstract sink for AlertEvent.
- LogAlertChannel: writes to a stdlib logger.
- WebhookAlertChannel: POST as JSON to a URL (uses urllib to stay dep-free).
- MultiplexAlertChannel: fan out to N channels.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Protocol


class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


@dataclass
class AlertEvent:
    kind: str                            # e.g. "trade_rejected", "cycle_locked"
    severity: AlertSeverity
    message: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "kind": self.kind,
            "severity": self.severity.value,
            "message": self.message,
            "metadata": self.metadata,
            "at": self.at.isoformat(),
        }


def make_alert(kind: str, message: str, severity: AlertSeverity = AlertSeverity.WARNING,
               **metadata: Any) -> AlertEvent:
    return AlertEvent(kind=kind, severity=severity, message=message, metadata=metadata)


class AlertChannel(Protocol):
    def emit(self, event: AlertEvent) -> None: ...


@dataclass
class LogAlertChannel:
    logger_name: str = "bee_bot.ladder.governance"
    _logger: logging.Logger = field(init=False)

    def __post_init__(self):
        self._logger = logging.getLogger(self.logger_name)

    def emit(self, event: AlertEvent) -> None:
        level = {
            AlertSeverity.INFO: logging.INFO,
            AlertSeverity.WARNING: logging.WARNING,
            AlertSeverity.ERROR: logging.ERROR,
            AlertSeverity.CRITICAL: logging.CRITICAL,
        }[event.severity]
        self._logger.log(level, "[%s] %s | %s",
                         event.kind, event.message,
                         json.dumps(event.metadata, default=str))


@dataclass
class WebhookAlertChannel:
    url: str
    timeout_seconds: float = 3.0
    http_post: Optional[Callable[[str, bytes, float], None]] = None
    """Optional injection point (used in tests to avoid real HTTP)."""

    def emit(self, event: AlertEvent) -> None:
        payload = json.dumps(event.to_dict(), default=str).encode("utf-8")
        if self.http_post is not None:
            self.http_post(self.url, payload, self.timeout_seconds)
            return
        import urllib.request
        req = urllib.request.Request(
            self.url, data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout_seconds):
            pass


@dataclass
class MultiplexAlertChannel:
    channels: List[AlertChannel] = field(default_factory=list)

    def emit(self, event: AlertEvent) -> None:
        for ch in self.channels:
            try:
                ch.emit(event)
            except Exception:
                # Never let one bad channel take down the alerting path.
                logging.getLogger("bee_bot.ladder.governance").exception(
                    "alert channel %r failed on event %s", ch, event.kind,
                )
