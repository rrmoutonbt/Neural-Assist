import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { SummaryStrip } from "../SummaryStrip";
import type { CycleView, ReportSummary } from "../types";


const cycle = (over: Partial<CycleView> = {}): CycleView => ({
  cycle_id: 7,
  starting_capital: 20_000, current_capital: 20_450, peak_capital: 20_450,
  drawdown_pct: 0, per_option_target_dollars: 225, realized_pnl: 450,
  trade_count: 2, trades_remaining: 10, cycle_max: 12,
  started_at: null, ended_at: null,
  is_active: true, locked: false, lock_reason: null,
  trades: [], ...over,
});

const summary = (over: Partial<ReportSummary> = {}): ReportSummary => ({
  generated_at: "2026-08-01",
  test_auc: 0.565, test_accuracy: 0.47, test_brier: 0.25,
  n_trades: 269, hit_rate: 0.829, total_pnl: -337435,
  profile_correlation: 0.225, gate_used: 60,
  ...over,
});


describe("SummaryStrip", () => {
  it("renders cycle progress in x/12 form", () => {
    render(<SummaryStrip cycle={cycle()} summary={null} />);
    expect(screen.getByTestId("summary-strip"))
      .toHaveTextContent("#7");
    expect(screen.getByTestId("summary-strip"))
      .toHaveTextContent("2/12");
    expect(screen.getByTestId("summary-strip"))
      .toHaveTextContent("10 left");
  });

  it("shows the LOCKED hint when the cycle is locked", () => {
    render(<SummaryStrip cycle={cycle({ locked: true })} summary={null} />);
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("locked");
  });

  it("renders a green capital delta when up, brick when down", () => {
    const { rerender } = render(
      <SummaryStrip cycle={cycle()} summary={null} />,
    );
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("+$450");

    rerender(
      <SummaryStrip cycle={cycle({ current_capital: 19_500 })} summary={null} />,
    );
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("−$500");
  });

  it("shows the summary numbers when present", () => {
    render(<SummaryStrip cycle={null} summary={summary()} />);
    const strip = screen.getByTestId("summary-strip");
    expect(strip).toHaveTextContent("60");            // gate
    expect(strip).toHaveTextContent("0.565");         // auc
    expect(strip).toHaveTextContent("82.9%");         // hit rate
    expect(strip).toHaveTextContent("−$337435 pnl");
  });

  it("shows 'transcript rule' when gate >= 90, 'reduced' otherwise", () => {
    const { rerender } = render(
      <SummaryStrip cycle={null} summary={summary({ gate_used: 90 })} />,
    );
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("transcript rule");
    rerender(<SummaryStrip cycle={null} summary={summary({ gate_used: 60 })} />);
    expect(screen.getByTestId("summary-strip")).toHaveTextContent("reduced");
  });

  it("shows 'never' when lastUpdated is absent", () => {
    render(<SummaryStrip cycle={null} summary={null} />);
    expect(screen.getByTestId("summary-strip-timestamp")).toHaveTextContent("never");
  });
});
