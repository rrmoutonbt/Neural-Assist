# LadderBot

Standalone futures-options trading bot enforcing the ladder methodology:

- **Score ≥ 90 gate.** No trade below 90.
- **12-trade cycle.** Never a 13th.
- **Fixed dollar target per option.** No stop-loss.

## Repo layout

```
ladderbot/          Python engine
  ├─ strategy.py, scorer.py, cycle.py, instruments.py, trace_slip.py
  ├─ execution/     order types, engine, chain provider, paper broker,
  │                 brokers/ (Schwab: broker, poller, streamer, OSI)
  ├─ persistence/   SQLite: cycles / slips / orders / fills
  ├─ governance/    risk limits, alerts, dashboard snapshot, guarded engine
  ├─ runtime/       LadderLiveRunner (one-object orchestrator)
  ├─ features/      support/resistance · fib · greeks · IV rank · seasonality
  ├─ ml/            calibrated GBDT classifier + dataset labeler
  ├─ backtest/      walk-forward validator + monthly-profile report
  ├─ api/           Flask blueprint: /api/ladder/*
  └─ bindings/      scorer <-> backtest adapter

ui/                 React 18 dashboard (TypeScript + webpack + Lightweight Charts)
tests/              pytest suite (Python)
scripts/            run_pipeline.py, start-stack.sh
out/ladder_run/     trained model + first-run report
docs/               architecture diagram, first-run analysis
```

## Quick start

### Backend (Python)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev,schwab]

# End-to-end pipeline against synthetic bars (no network required):
python scripts/run_pipeline.py --data synthetic --years 3 \
       --dollar-target 200 --gate 60 --out-dir out/ladder_run

# Standalone REST API on :5000 for the frontend to consume:
python -m ladderbot.api.serve --host 127.0.0.1 --port 5000
```

### Frontend (React)

```bash
cd ui
npm install
LADDER_API_URL=http://127.0.0.1:5000 npm run dev
# open http://localhost:3100
```

### Backend + frontend together

```bash
bash scripts/start-stack.sh
```

## Provenance

This is a consolidated copy. The source components originally lived across four
sibling repos (`Bee_bot-7-12-26`, `DATASOURCE-9-24-25`, `Mastery`, `WTTracker`)
under the shared branch `claude/futures-trading-strategy-bbs4t8`; those repos
are untouched. See `docs/` for the architecture diagram and the first honest
end-to-end run report.

## What is honest — and what isn't

**Honest right now:**
- Every unit test passes. The stack composes end-to-end against synthetic data.
- SQLite persistence survives process restarts.
- One end-to-end training + backtest run produced real numbers (see `out/ladder_run/report.json`
  and `docs/`); those numbers show the current feature set achieves AUC ≈ 0.565 —
  the 90-gate ships zero trades on this data.

**Not yet honest:**
- No live broker connection has ever happened. The Schwab adapter is
  test-driven against a scripted FakeTransport, never a real endpoint.
- No real option-chain history has been used for labeling or backtesting.
  Fills use a delta-linear P&L proxy.
- The 90-gate rule from the source transcript remains a **target**, not
  demonstrated evidence. It's what the classifier would have to hit.

## License

Proprietary — all rights reserved.
