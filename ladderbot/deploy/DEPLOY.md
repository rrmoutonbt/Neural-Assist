# LadderBot — VPS deployment runbook

Two supported paths. Pick one.

| Path | When to use |
|---|---|
| **A. WTT overlay** | You already run WTT on the VPS and want LadderBot to appear as a new chart inside the same UI + backend. **Chosen for this deployment.** |
| **B. Standalone container** | You want LadderBot on its own port / domain / process (no WTT interaction). Useful for a dry-run before touching WTT. |

Both paths ship in the same zip. Directions below assume the zip has been dropped at **`/tmp/ladderbot-vps.zip`** on the VPS.

---

## Path A — Overlay into WTT (the "new chart in WTT" path)

Assumes WTT is already checked out on the VPS at something like `/opt/WTTracker` (adjust to actual path).

### 1. Unpack in /tmp

```bash
cd /tmp
unzip -q ladderbot-vps.zip -d ladderbot
cd ladderbot
```

Expected top-level: `ladderbot/`, `ui/`, `tests/`, `scripts/`, `deploy/`, `out/`, `docs/`, `pyproject.toml`, `README.md`.

### 2. Verify the LadderBot side is healthy (optional but recommended)

```bash
# Python side — 130 tests, ~10 seconds
python3 -m pip install --user -e '.[dev,schwab]'
python3 -m pytest tests/ -q

# Frontend side — 60 tests, ~10 seconds
cd ui && npm ci && npm test -- --ci && cd ..
```

If either fails, stop here — do not overlay a broken build into WTT.

### 3. Point the overlay script at your WTT checkout

```bash
export WTT_ROOT=/opt/WTTracker         # adjust
./deploy/wtt-integration/overlay-into-wtt.sh "$WTT_ROOT"
```

The script:

1. Copies `ladderbot/api/` → `$WTT_ROOT/backend-trading-service/ladder_api/`
2. Copies `ladderbot/backtest/` → `$WTT_ROOT/backend-trading-service/ladder_backtest/`
3. Copies `ladderbot/bindings/` → `$WTT_ROOT/backend-trading-service/ladder_bindings/`
4. Copies the whole `ladderbot/` package → `$WTT_ROOT/backend-trading-service/ladder_engine/ladderbot/` (so future WTT code can `from ladderbot.execution.brokers import SchwabBroker`)
5. Copies `ui/src/features/ladder/` → `$WTT_ROOT/src/features/ladder/` (drops the `__tests__` subdir)
6. Copies `ui/src/ladder-entry.tsx` + `ui/public/ladder.html` + `ui/webpack.config.js` (renamed to `webpack.ladder.config.js`)
7. Drops `chart_type_patch.ts` alongside — the file exports `registerLadderChartType()` for you to call from WTT's chart-type bootstrap
8. Adds `lightweight-charts ^4.2.0` to WTT's `package.json` dependencies (if not already there)
9. Adds `dev:ladder` / `build:ladder` / `start:ladder` / `start:ladder:stack` npm scripts to WTT's `package.json`
10. Registers the `ladder_api` blueprint in `backend-trading-service/app.py` inside a `try/except` so a bad import can't take down the rest of the trading service

It's **idempotent** — safe to re-run for updates.

### 4. Rebuild WTT

```bash
cd "$WTT_ROOT"

# Frontend deps + production bundle (Ladder-only entry)
npm install
npm run build:ladder                    # → dist-ladder/

# Python side — install any missing extras
cd backend-trading-service
pip install -e ../ladder_engine[schwab,prod]
cd ..
```

### 5. Register the chart type in WTT's chart-type bootstrap

Wherever WTT wires its other chart types (in the sources I saw, `src/chart-types/FinalChartTypes.ts` or the platform bootstrap module), add:

```ts
import { registerLadderChartType } from "./features/ladder/chart_type_patch";

// Somewhere your other chart types get registered:
registerLadderChartType(chartTypeRegistry);
```

The exact API to `chartTypeRegistry` depends on how WTT's registry is shaped — `chart_type_patch.ts` uses a `.register(id, entry)` duck-typed API; if yours differs, adjust the two lines inside `registerLadderChartType()`.

The chart entry ID is **`ladderbot`**; the entry supplies a `component` that renders `<LadderDashboard/>` at full viewport with icon 🪜 and label `"LadderBot · gate ≥ 90"`.

### 6. Restart WTT

Whatever service manager WTT uses on your VPS:

```bash
# systemd example
systemctl restart wttracker-backend
systemctl restart wttracker-frontend   # or your nginx-served static build
```

If WTT is dockerized, `docker compose up -d --build` after the overlay.

### 7. Smoke check the new endpoints

```bash
# LadderBot health
curl -sS http://127.0.0.1:5000/api/ladder/health
# → {"db_exists":false,"db_path":"...","ok":true,"report_dir":"...","report_exists":false}

# Snapshot (empty until you populate a cycle)
curl -sS http://127.0.0.1:5000/api/ladder/snapshot | jq
# → {"cycle":null,"empty":true,"trades":[]}

# Run the pipeline once to populate report.json (populates the summary strip):
python3 "$WTT_ROOT/scripts/run_ladder_pipeline.py" \
    --data synthetic --years 2 --gate 60 \
    --out-dir "$WTT_ROOT/out/ladder_run"

curl -sS http://127.0.0.1:5000/api/ladder/report/summary | jq
```

Then in the WTT UI, pick the new **LadderBot · gate ≥ 90** chart type from wherever WTT lists chart types. You'll see the dashboard from `docs/first-run-report.html` rendered live against your local API.

### 8. Rollback

The overlay script writes but never deletes WTT's own files. To roll back:

```bash
cd "$WTT_ROOT"
git diff --stat                         # see what changed
git checkout -- .                       # revert tracked files
git clean -fd backend-trading-service/ladder_api \
              backend-trading-service/ladder_backtest \
              backend-trading-service/ladder_bindings \
              backend-trading-service/ladder_engine \
              src/features/ladder \
              src/ladder-entry.tsx \
              public/ladder.html \
              webpack.ladder.config.js \
              docs/ladder \
              out/ladder_run
```

---

## Path B — Standalone container (optional)

Use this as a dry-run or if you want LadderBot on its own port before touching WTT.

```bash
cd /tmp/ladderbot/deploy/docker
cp .env.example .env
# edit .env — set LADDER_HOST_PORT, LADDER_CORS_ORIGINS
docker compose up -d --build
docker compose ps
docker compose logs -f ladderbot
```

Reachable at:

- `http://<vps>:5000/`               — bundled UI (dashboard)
- `http://<vps>:5000/api/ladder/*`   — REST API

For an Nginx-fronted setup on a real hostname, use `deploy/systemd/nginx-ladderbot.conf` as a template (adjust cert paths + upstream port).

---

## Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `ImportError: no module named ladder_api` in WTT logs | Overlay skipped or Python path wrong | Re-run `overlay-into-wtt.sh`, verify `backend-trading-service/ladder_api/__init__.py` exists |
| Chart-type dropdown doesn't show LadderBot | `registerLadderChartType()` never called | Add the two-line import + call in WTT's chart-type bootstrap module |
| `/api/ladder/health` returns 404 | Blueprint failed to register — bad import in `ladder_api/__init__.py` | `tail -f` WTT backend log, look for the `logger.warning("ladder_api blueprint not registered: %s")` line |
| Empty dashboard, "no report" everywhere | `LADDER_REPORT_DIR` doesn't have `report.json` | Run `python3 scripts/run_ladder_pipeline.py --out-dir <report_dir>` once |
| Bundle loads but every API call is CORS-blocked | Frontend served from a different origin than backend | Set `LADDER_CORS_ORIGINS=https://your.wtt.hostname` in the environment |

---

## What this deployment does NOT do

- **No live broker connection.** The Schwab adapter is present in the code but no OAuth flow runs on startup. Configure it via `SchwabConfig.token_provider` when you're ready.
- **No live market data feed.** Bars come from the synthetic generator by default; set `LADDER_BAR_SOURCE=yfinance` to hit Yahoo (needs outbound HTTPS to `query1.finance.yahoo.com`).
- **The 90-gate rule is a rule, not proven capability.** Current model AUC is 0.565 — the classifier ships zero trades at gate ≥ 90 on synthetic data. Feature enrichment + real chain history is the honest gap.
