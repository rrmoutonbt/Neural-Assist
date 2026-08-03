#!/usr/bin/env bash
# overlay-into-wtt.sh
#
# Overlays LadderBot (this repo) into an existing WTTracker checkout so
# LadderBot appears as a new chart inside WTT's frontend and a new
# blueprint on WTT's backend. Idempotent — safe to re-run after a code
# refresh.
#
# Usage:
#   ./deploy/wtt-integration/overlay-into-wtt.sh /path/to/WTTracker
#
# What it copies:
#   ladderbot/*   ->  <wtt>/backend-trading-service/ladder_*/  (as three
#                    sibling packages preserving the ladder_api / ladder_backtest
#                    / ladder_bindings names WTT already imports)
#   ui/src/features/ladder/    ->  <wtt>/src/features/ladder/
#   ui/src/ladder-entry.tsx    ->  <wtt>/src/ladder-entry.tsx
#   ui/public/ladder.html      ->  <wtt>/public/ladder.html
#   ui/webpack.config.js       ->  <wtt>/webpack.ladder.config.js
#   scripts/*                  ->  <wtt>/scripts/  (namespaced ladder-*)
#   out/ladder_run/*           ->  <wtt>/out/ladder_run/
#   docs/*                     ->  <wtt>/docs/ladder/
#
# Additionally registers a chart-type entry so LadderDashboard shows up
# in WTT's chart-type registry (see chart_type_patch.ts).

set -euo pipefail

WTT_ROOT="${1:-}"
if [ -z "$WTT_ROOT" ] || [ ! -d "$WTT_ROOT" ]; then
    echo "usage: $0 <path-to-WTTracker-checkout>"
    exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LB_ROOT="$(cd "$HERE/../.." && pwd)"
WTT_BACKEND="$WTT_ROOT/backend-trading-service"

if [ ! -d "$WTT_BACKEND" ]; then
    echo "error: $WTT_BACKEND not found — is $WTT_ROOT really a WTTracker checkout?"
    exit 3
fi
if [ ! -d "$WTT_ROOT/src" ]; then
    echo "error: $WTT_ROOT/src not found — WTT frontend expected"
    exit 3
fi

echo "▲ Overlaying LadderBot ($LB_ROOT) into WTT ($WTT_ROOT)"

# ─── Backend: three ladder_* packages under backend-trading-service ─────
#
# WTT's app.py already tries `from ladder_api import ladder_bp` under a
# guarded try/except (Sprint 10). We ship the code under three package
# names it expects: ladder_api, ladder_backtest, ladder_bindings.
#
# The engine itself (strategy/execution/persistence/etc) is folded into
# ladder_api's namespace since WTT never imports it directly — the
# blueprint owns the runtime.
#
# For consumers that WOULD import the engine directly (a future WTT
# feature), the whole `ladderbot/` package is also shipped intact so
# `import ladderbot` works after `pip install -e ladder_engine/`.

mkdir -p "$WTT_BACKEND/ladder_api" \
         "$WTT_BACKEND/ladder_backtest" \
         "$WTT_BACKEND/ladder_bindings"

# The three top-level Python packages WTT app.py knows about.
rsync -a --delete "$LB_ROOT/ladderbot/api/"      "$WTT_BACKEND/ladder_api/"
rsync -a --delete "$LB_ROOT/ladderbot/backtest/" "$WTT_BACKEND/ladder_backtest/"
rsync -a --delete "$LB_ROOT/ladderbot/bindings/" "$WTT_BACKEND/ladder_bindings/"

# Ship the WHOLE ladderbot package so future WTT code can
# `from ladderbot.execution.brokers import SchwabBroker` etc.
mkdir -p "$WTT_BACKEND/ladder_engine"
rsync -a --delete \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    "$LB_ROOT/ladderbot/" "$WTT_BACKEND/ladder_engine/ladderbot/"
cp "$LB_ROOT/pyproject.toml" "$WTT_BACKEND/ladder_engine/pyproject.toml"
cp "$LB_ROOT/README.md"      "$WTT_BACKEND/ladder_engine/README.md"

# ─── Frontend ──────────────────────────────────────────────────────────
mkdir -p "$WTT_ROOT/src/features/ladder"
rsync -a --delete \
    --exclude '__tests__' \
    "$LB_ROOT/ui/src/features/ladder/" \
    "$WTT_ROOT/src/features/ladder/"

cp "$LB_ROOT/ui/src/ladder-entry.tsx"   "$WTT_ROOT/src/ladder-entry.tsx"
cp "$LB_ROOT/ui/public/ladder.html"     "$WTT_ROOT/public/ladder.html"
cp "$LB_ROOT/ui/webpack.config.js"      "$WTT_ROOT/webpack.ladder.config.js"

# Chart-type registration overlay (see chart_type_patch.ts).
cp "$HERE/chart_type_patch.ts" \
    "$WTT_ROOT/src/features/ladder/chart_type_patch.ts"

# ─── Scripts + artifacts + docs ────────────────────────────────────────
mkdir -p "$WTT_ROOT/scripts"
cp "$LB_ROOT/scripts/run_pipeline.py" "$WTT_ROOT/scripts/run_ladder_pipeline.py"
cp "$LB_ROOT/scripts/start-stack.sh"  "$WTT_ROOT/scripts/start-ladder-stack.sh"
chmod +x "$WTT_ROOT/scripts/start-ladder-stack.sh"

mkdir -p "$WTT_ROOT/out/ladder_run"
if [ -f "$LB_ROOT/out/ladder_run/report.json" ]; then
    cp "$LB_ROOT/out/ladder_run/report.json"        "$WTT_ROOT/out/ladder_run/"
    cp "$LB_ROOT/out/ladder_run/ladder_model.joblib" "$WTT_ROOT/out/ladder_run/"
fi

mkdir -p "$WTT_ROOT/docs/ladder"
cp -r "$LB_ROOT/docs/." "$WTT_ROOT/docs/ladder/"

# ─── Merge npm dep so lightweight-charts is on WTT's tree ──────────────
if ! grep -q '"lightweight-charts"' "$WTT_ROOT/package.json"; then
    echo "▲ Adding lightweight-charts to WTT/package.json (manual npm install still required)"
    python3 - "$WTT_ROOT/package.json" <<'PY'
import json, sys
p = sys.argv[1]
with open(p) as f:
    pkg = json.load(f)
pkg.setdefault("dependencies", {})["lightweight-charts"] = "^4.2.0"
with open(p, "w") as f:
    json.dump(pkg, f, indent=2)
    f.write("\n")
print("  wrote lightweight-charts to dependencies")
PY
fi

# ─── Merge npm scripts (dev:ladder / build:ladder / start:ladder:stack) ─
python3 - "$WTT_ROOT/package.json" <<'PY'
import json, sys
p = sys.argv[1]
with open(p) as f:
    pkg = json.load(f)
scripts = pkg.setdefault("scripts", {})
added = 0
for k, v in {
    "dev:ladder":         "webpack serve --config webpack.ladder.config.js --mode development",
    "build:ladder":       "NODE_ENV=production webpack --config webpack.ladder.config.js --mode production",
    "start:ladder":       "npm run dev:ladder",
    "start:ladder:stack": "bash scripts/start-ladder-stack.sh",
}.items():
    if scripts.get(k) != v:
        scripts[k] = v
        added += 1
with open(p, "w") as f:
    json.dump(pkg, f, indent=2)
    f.write("\n")
print(f"  wrote {added} script entries")
PY

# ─── Register ladder blueprint on WTT's app.py if not already there ────
APP_PY="$WTT_BACKEND/app.py"
if [ -f "$APP_PY" ] && ! grep -q "from ladder_api import ladder_bp" "$APP_PY"; then
    echo "▲ Registering ladder_api blueprint in app.py"
    python3 - "$APP_PY" <<'PY'
import re, sys
p = sys.argv[1]
with open(p) as f: src = f.read()
patch = '''
# ─── LadderBot (overlaid via deploy/wtt-integration) ─────────────────
try:
    from ladder_api import ladder_bp
    app.register_blueprint(ladder_bp)
    logger.info("registered ladder_api blueprint at /api/ladder")
except Exception as _e:
    logger.warning("ladder_api blueprint not registered: %s", _e)
'''
# Insert once, right after `CORS(app)`.
new = re.sub(r'(CORS\(app\)\s*\n)', r'\1' + patch, src, count=1)
if new != src:
    with open(p, "w") as f: f.write(new)
    print("  inserted after CORS(app)")
else:
    print("  no CORS(app) marker found — insert manually")
PY
fi

echo
echo "✓ overlay complete."
echo "  next: cd $WTT_ROOT && npm install && npm run build:ladder"
echo "  serve UI + API together with: bash scripts/start-ladder-stack.sh"
