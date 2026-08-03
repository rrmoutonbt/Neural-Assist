/**
 * LadderDashboard — full integration test.
 *
 * Mounts the composed page with a mocked LadderApiClient that
 * satisfies every endpoint the child components fetch on their own,
 * and asserts that each section renders + wires together correctly.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";


// Lightweight Charts needs a real Canvas; mock the surface we use.
jest.mock("lightweight-charts", () => {
  const candles = {
    setData: jest.fn(),
    setMarkers: jest.fn(),
    createPriceLine: jest.fn(() => ({ _id: 1 })),
    removePriceLine: jest.fn(),
  };
  const volume  = { setData: jest.fn(),
                    priceScale: () => ({ applyOptions: jest.fn() }) };
  const chart   = {
    addCandlestickSeries: jest.fn(() => candles),
    addHistogramSeries:   jest.fn(() => volume),
    applyOptions:         jest.fn(),
    timeScale:            () => ({ fitContent: jest.fn() }),
    remove:               jest.fn(),
  };
  return {
    __esModule: true,
    createChart: jest.fn(() => chart),
    CrosshairMode: { Normal: 0 },
    LineStyle: { Dashed: 2, Solid: 0 },
    _spy: { chart, candles, volume },
  };
});

(global as any).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

import { LadderApiClient } from "../api";
import { LadderDashboard } from "../LadderDashboard";
import type { LadderCandidateRow } from "../LadderTable";


// ─── canned payloads ────────────────────────────────────────────────────

const CYCLE = {
  cycle_id: 42,
  starting_capital: 20_000, current_capital: 20_450, peak_capital: 20_450,
  drawdown_pct: 0, per_option_target_dollars: 225, realized_pnl: 450,
  trade_count: 2, trades_remaining: 10, cycle_max: 12,
  started_at: "2026-08-01T00:00:00Z", ended_at: null,
  is_active: true, locked: false, lock_reason: null,
  trades: [
    { n: 1, pnl_dollars: 225, capital_after: 20_225, at: "t1", meta: {} },
    { n: 2, pnl_dollars: 225, capital_after: 20_450, at: "t2", meta: {} },
  ],
};

const PROFILE = {
  observed: { "5": 31, "6": 23 }, expected: { "5": 10, "6": 12 },
  diff: { "5": 21, "6": 11 },
  correlation: 0.225, total_observed: 54, total_expected: 22,
};

const SUMMARY = {
  generated_at: "2026-08-01T00:00:00Z",
  test_auc: 0.565, test_accuracy: 0.47, test_brier: 0.25,
  n_trades: 269, hit_rate: 0.829, total_pnl: -337_435,
  profile_correlation: 0.225, gate_used: 60,
};

const TRADES = [{
  id: 1, cycle_id: 42, cycle_trade_number: 1,
  symbol: "CL", side: "CALL" as const, contracts: 5,
  entry_price_points: 84, target_price_points: 106.5,
  entry_fill_points: 84, exit_fill_points: 106.5,
  entry_time: "2026-07-15T13:22:00Z", exit_time: "2026-07-17T14:00:00Z",
  days_to_expiration: 45, delta: 0.38,
  ladder_score: 96, realized_pnl_dollars: 1125,
  created_at: "2026-07-15T13:22:00Z", updated_at: "2026-07-17T14:00:00Z",
}];

const BARS = {
  symbol: "CL", n: 2, source: "synthetic",
  candles: [
    { time: "2026-07-15", open: 100, high: 101, low: 99, close: 100.5 },
    { time: "2026-07-16", open: 100.5, high: 102, low: 100, close: 101.5 },
  ],
  volume: [
    { time: "2026-07-15", value: 1000 },
    { time: "2026-07-16", value: 1200 },
  ],
};

const CANDIDATES: LadderCandidateRow[] = [
  { symbol: "CL", side: "CALL", score: 96, expectedDollarsPerHour: 220,
    delta: 0.38, premiumDollars: 840, daysToExpiration: 45 },
  { symbol: "ZS", side: "CALL", score: 91, expectedDollarsPerHour: 150,
    delta: 0.35, premiumDollars: 700, daysToExpiration: 40 },
];


const jsonResp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const scriptedFetch = jest.fn(async (url: any) => {
  const path = new URL(url.toString(), "http://localhost").pathname;
  if (path.endsWith("/snapshot"))
    return jsonResp({ cycle: CYCLE, empty: false });
  if (path.endsWith("/monthly-profile"))
    return jsonResp({ empty: false, profile: PROFILE });
  if (path.endsWith("/report/summary"))
    return jsonResp({ empty: false, summary: SUMMARY });
  if (path.includes("/trades"))
    return jsonResp({ trades: TRADES, count: TRADES.length, filters: {} });
  if (path.includes("/bars/"))
    return jsonResp(BARS);
  return jsonResp({ error: `no handler for ${path}` }, 404);
});


describe("LadderDashboard", () => {
  afterEach(() => { scriptedFetch.mockClear(); jest.clearAllMocks(); });

  it("mounts, fetches, and renders every section", async () => {
    const client = new LadderApiClient({ fetchImpl: scriptedFetch as any });
    render(
      <LadderDashboard
        symbol="CL"
        client={client}
        pollIntervalMs={0}
        candidates={CANDIDATES}
      />,
    );

    // frame present immediately
    expect(screen.getByTestId("ladder-dashboard")).toBeInTheDocument();
    // ladder table renders from the prop, no fetch required
    expect(screen.getByTestId("ladder-table")).toBeInTheDocument();
    expect(screen.getByTestId("ladder-row-CL-CALL")).toBeInTheDocument();

    // summary strip populates once poll resolves
    await waitFor(() =>
      expect(screen.getByTestId("summary-strip")).toHaveTextContent("#42"),
    );
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("2/12");
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("0.565");

    // cycle progress renders after fetch
    await waitFor(() =>
      expect(screen.getByTestId("cycle-progress")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("cycle-dot-1")).toHaveAttribute("data-state", "win");

    // monthly profile renders after fetch
    await waitFor(() =>
      expect(screen.getByTestId("monthly-profile")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("monthly-profile-correlation"))
      .toHaveTextContent("0.225");
  });

  it("threads overlay markers into the chart once trades load", async () => {
    const { _spy } = require("lightweight-charts");
    const client = new LadderApiClient({ fetchImpl: scriptedFetch as any });
    render(
      <LadderDashboard
        symbol="CL"
        client={client}
        pollIntervalMs={0}
        candidates={CANDIDATES}
      />,
    );
    // Wait until at least one call carries the entry marker for the CL trade.
    // Order of the two async fetches (bars vs trades) is not guaranteed, so
    // the last setMarkers() call may still be the initial empty payload —
    // what matters is that a non-empty call was made at some point.
    await waitFor(() => {
      const populated = _spy.candles.setMarkers.mock.calls.some(
        (c: any[]) => Array.isArray(c[0]) && c[0].length > 0,
      );
      expect(populated).toBe(true);
    });
    const withEntry = _spy.candles.setMarkers.mock.calls.find(
      (c: any[]) => Array.isArray(c[0]) &&
        c[0].some((m: any) => m.text?.includes("CALL")),
    );
    expect(withEntry).toBeDefined();
  });

  it("switches symbol when picker clicked and re-fetches bars", async () => {
    const client = new LadderApiClient({ fetchImpl: scriptedFetch as any });
    render(
      <LadderDashboard
        symbol="CL"
        client={client}
        universe={["CL", "NQ"]}
        pollIntervalMs={0}
        candidates={CANDIDATES}
      />,
    );
    await waitFor(() =>
      expect(scriptedFetch).toHaveBeenCalledWith(
        expect.stringContaining("/bars/CL"), expect.anything(),
      ),
    );
    fireEvent.click(screen.getByTestId("symbol-pick-NQ"));
    await waitFor(() =>
      expect(scriptedFetch).toHaveBeenCalledWith(
        expect.stringContaining("/bars/NQ"), expect.anything(),
      ),
    );
    expect(screen.getByTestId("symbol-pick-NQ"))
      .toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("symbol-pick-CL"))
      .toHaveAttribute("data-active", "false");
  });

  it("shows a poll-error banner with a retry button when polling fails", async () => {
    const failFetch = jest.fn(async () => jsonResp({ error: "boom" }, 500));
    const client = new LadderApiClient({ fetchImpl: failFetch as any });
    render(<LadderDashboard symbol="CL" client={client} pollIntervalMs={0} />);
    await waitFor(() =>
      expect(screen.getByTestId("dashboard-poll-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("dashboard-poll-error"))
      .toHaveTextContent(/polling error/);
    expect(screen.getByTestId("dashboard-poll-error"))
      .toHaveTextContent(/retry/);
  });
});
