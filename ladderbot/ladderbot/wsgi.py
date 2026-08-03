"""Production WSGI entry.

    gunicorn --workers 2 --bind 0.0.0.0:5000 ladderbot.wsgi:app

Config flows from the environment (see deploy/.env.example):

    LADDER_DB_PATH        default: /var/lib/ladderbot/ladder.db
    LADDER_REPORT_DIR     default: /var/lib/ladderbot/out/ladder_run
    LADDER_BAR_SOURCE     default: synthetic  (synthetic | yfinance)

Also mounts a tiny StaticFrontend blueprint at "/" that serves the
built UI bundle if LADDER_UI_DIST_DIR points at ui/dist-ladder/. When
unset, the root just returns a JSON pointer at /api/ladder/health so
you know the API is up (production layout typically puts Nginx in
front and serves static files there).
"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, send_from_directory
from flask_cors import CORS

from .api.blueprint import ladder_bp
from .api.config import LadderApiConfig, configure


def _env_config() -> LadderApiConfig:
    return LadderApiConfig(
        db_path        = os.environ.get("LADDER_DB_PATH",   "/var/lib/ladderbot/ladder.db"),
        report_dir     = os.environ.get("LADDER_REPORT_DIR","/var/lib/ladderbot/out/ladder_run"),
        bar_source     = os.environ.get("LADDER_BAR_SOURCE", "synthetic"),
        bars_default_years = int(os.environ.get("LADDER_BARS_YEARS", "2")),
    )


def create_app() -> Flask:
    configure(_env_config())
    app = Flask("ladderbot", static_folder=None)
    CORS(app, resources={r"/api/*": {"origins": os.environ.get(
        "LADDER_CORS_ORIGINS", "*",
    ).split(",")}})
    app.register_blueprint(ladder_bp)

    # Optional in-process static serving of the built UI. Useful for
    # docker-single-image deployments; Nginx-fronted setups leave this
    # unset and serve dist-ladder/ directly.
    ui_dist = os.environ.get("LADDER_UI_DIST_DIR")
    if ui_dist and Path(ui_dist).is_dir():
        _mount_static(app, ui_dist)
    else:
        @app.route("/", methods=["GET"])
        def _root():
            return {
                "service": "ladderbot",
                "hint": "GET /api/ladder/health",
            }

    return app


def _mount_static(app: Flask, ui_dist: str) -> None:
    root = Path(ui_dist).resolve()

    @app.route("/", methods=["GET"])
    def _index():
        return send_from_directory(str(root), "index.html")

    @app.route("/<path:asset>", methods=["GET"])
    def _static_asset(asset: str):
        # Never shadow the API prefix.
        if asset.startswith("api/"):
            return {"error": "not_found"}, 404
        candidate = (root / asset).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return {"error": "forbidden"}, 403
        if candidate.is_file():
            return send_from_directory(str(root), asset)
        # SPA fallback — unknown paths return index.html so the
        # frontend's client-side routing can take over.
        return send_from_directory(str(root), "index.html")


# Gunicorn imports this symbol.
app = create_app()
