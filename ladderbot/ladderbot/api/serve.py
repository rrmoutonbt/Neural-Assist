"""Run the standalone LadderBot REST server.

    python -m ladderbot.api.serve --host 0.0.0.0 --port 5100

Not used in production (mount the blueprint on the main app instead);
useful for local UI development against a live backend without the
rest of the gxt.trading stack loading.
"""

from __future__ import annotations

import argparse

from .app_factory import create_ladder_app
from .config import LadderApiConfig


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=5100)
    p.add_argument("--db-path", default=None)
    p.add_argument("--report-dir", default=None)
    p.add_argument("--debug", action="store_true")
    args = p.parse_args()

    cfg = LadderApiConfig()
    if args.db_path:    cfg.db_path = args.db_path
    if args.report_dir: cfg.report_dir = args.report_dir

    app = create_ladder_app(cfg)
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
