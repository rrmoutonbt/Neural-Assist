import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { CycleProgress } from "../CycleProgress";
import { LadderApiClient } from "../api";
import type { CycleView } from "../types";


const cycleWith = (overrides: Partial<CycleView> = {}): CycleView => ({
  cycle_id: 7,
  starting_capital: 20000,
  current_capital: 20450,
  peak_capital: 20450,
  drawdown_pct: 0,
  per_option_target_dollars: 225,
  realized_pnl: 450,
  trade_count: 2,
  trades_remaining: 10,
  cycle_max: 12,
  started_at: "2026-08-01T00:00:00Z",
  ended_at: null,
  is_active: true,
  locked: false,
  lock_reason: null,
  trades: [
    { n: 1, pnl_dollars: 225, capital_after: 20225, at: "t1", meta: {} },
    { n: 2, pnl_dollars: 225, capital_after: 20450, at: "t2", meta: {} },
  ],
  ...overrides,
});


describe("CycleProgress", () => {
  it("renders 12 dots plus a forbidden 13", () => {
    render(<CycleProgress cycle={cycleWith()} />);
    for (let i = 1; i <= 12; i++) {
      expect(screen.getByTestId(`cycle-dot-${i}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("cycle-dot-forbidden-13")).toBeInTheDocument();
  });

  it("marks first two dots as wins and the rest as pending", () => {
    render(<CycleProgress cycle={cycleWith()} />);
    expect(screen.getByTestId("cycle-dot-1")).toHaveAttribute("data-state", "win");
    expect(screen.getByTestId("cycle-dot-2")).toHaveAttribute("data-state", "win");
    expect(screen.getByTestId("cycle-dot-3")).toHaveAttribute("data-state", "pending");
    expect(screen.getByTestId("cycle-dot-12")).toHaveAttribute("data-state", "pending");
  });

  it("shows loss dots when pnl is negative", () => {
    render(<CycleProgress cycle={cycleWith({
      trades: [
        { n: 1, pnl_dollars: -300, capital_after: 19700, at: "t1", meta: {} },
      ],
      trade_count: 1, trades_remaining: 11, realized_pnl: -300,
    })} />);
    expect(screen.getByTestId("cycle-dot-1")).toHaveAttribute("data-state", "loss");
  });

  it("shows the LOCKED banner when the cycle is locked", () => {
    render(<CycleProgress cycle={cycleWith({
      locked: true, lock_reason: "drawdown kill-switch",
    })} />);
    const banner = screen.getByTestId("cycle-progress-locked-banner");
    expect(banner).toHaveTextContent(/CYCLE LOCKED/);
    expect(banner).toHaveTextContent(/drawdown kill-switch/);
  });

  it("renders empty message when cycle is null", () => {
    render(<CycleProgress cycle={null} />);
    expect(screen.getByTestId("cycle-progress-empty")).toBeInTheDocument();
  });

  it("draws the cumulative PnL spark when >=2 trades", () => {
    render(<CycleProgress cycle={cycleWith()} />);
    expect(screen.getByTestId("cycle-pnl-spark")).toBeInTheDocument();
  });

  it("fetches from client when no cycle prop is supplied", async () => {
    const client = new LadderApiClient({
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({
          cycle: cycleWith(), empty: false,
        }), { status: 200 })),
    });
    render(<CycleProgress client={client} />);
    await waitFor(() =>
      expect(screen.getByTestId("cycle-progress")).toBeInTheDocument(),
    );
  });
});
