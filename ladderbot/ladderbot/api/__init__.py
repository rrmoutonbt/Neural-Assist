"""LadderBot REST API — Flask Blueprint.

Serves the JSON contract the WTTracker frontend needs to render the
Ladder UI (table, cycle progress, monthly profile, OHLCV overlay).

Design constraints:
  - Self-contained: importing this module MUST NOT require the
    existing gxt.trading stack to import cleanly.
  - Read-only: never mutates ladder.db or writes to disk. A separate
    write-path lives in the LadderLiveRunner.
  - Graceful degradation: every endpoint returns a well-shaped JSON
    body (with clear "empty" markers) when the underlying DB or
    report file is missing.

Public surface:
    - ladder_bp: Flask Blueprint (prefix /api/ladder)
    - create_ladder_app(config): standalone Flask app for tests and
      independent running
    - configure(config): configure DB path, report dir, etc.
"""

from .blueprint import ladder_bp
from .app_factory import create_ladder_app
from .config import LadderApiConfig, configure

__all__ = [
    "ladder_bp",
    "create_ladder_app",
    "LadderApiConfig",
    "configure",
]
