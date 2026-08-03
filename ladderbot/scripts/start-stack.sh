#!/usr/bin/env bash
# start-ladder-stack.sh — boot the LadderBot backend + frontend together.
#
#   npm run start:ladder:stack
#
# Backend: standalone ladderbot.api Flask server on :5000
#   (Sprint 10 Day 1 delivery — doesn't require the full gxt.trading stack.)
# Frontend: webpack dev server on :3100 with /api/ladder proxied to :5000.
#
# Ctrl-C stops both processes cleanly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend-trading-service"

LADDER_DB_PATH="${LADDER_DB_PATH:-$REPO_ROOT/ladder.db}"
LADDER_REPORT_DIR="${LADDER_REPORT_DIR:-$REPO_ROOT/out/ladder_run}"
LADDER_API_PORT="${LADDER_API_PORT:-5000}"

echo "▲ Starting LadderBot backend on :$LADDER_API_PORT"
echo "  db:     $LADDER_DB_PATH"
echo "  report: $LADDER_REPORT_DIR"

(
  cd "$BACKEND_DIR"
  python -m ladderbot.api.serve \
    --host 127.0.0.1 \
    --port "$LADDER_API_PORT" \
    --db-path "$LADDER_DB_PATH" \
    --report-dir "$LADDER_REPORT_DIR"
) &
BACKEND_PID=$!

cleanup() {
  echo
  echo "▼ Stopping stack (backend pid=$BACKEND_PID)"
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▲ Starting LadderBot frontend on :3100 (proxy → :$LADDER_API_PORT)"
cd "$REPO_ROOT"
LADDER_API_URL="http://127.0.0.1:$LADDER_API_PORT" npm run dev:ladder
