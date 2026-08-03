"""create_ladder_app: standalone Flask app for the LadderBot REST layer.

Used by:
  - Unit tests (Flask test client)
  - Independent `python -m ladderbot.api.serve` runs
  - Environments where the full gxt.trading stack is unavailable

The primary WTTracker app (backend-trading-service/app.py) instead
registers `ladder_bp` on its existing Flask instance — see the
guarded hook added there.
"""

from __future__ import annotations

from typing import Optional

from flask import Flask
from flask_cors import CORS

from .blueprint import ladder_bp
from .config import LadderApiConfig, configure


def create_ladder_app(config: Optional[LadderApiConfig] = None) -> Flask:
    if config is not None:
        configure(config)
    app = Flask("ladderbot.api")
    CORS(app)
    app.register_blueprint(ladder_bp)

    @app.route("/", methods=["GET"])
    def index():
        return {
            "service": "ladderbot.api",
            "routes": [str(r) for r in app.url_map.iter_rules()
                       if r.endpoint != "static"],
        }

    return app
