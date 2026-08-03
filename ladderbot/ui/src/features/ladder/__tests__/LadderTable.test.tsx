import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import { LadderTable, LadderCandidateRow } from "../LadderTable";


const rows: LadderCandidateRow[] = [
  { symbol: "CL", side: "CALL", score: 100, expectedDollarsPerHour: 220,
    delta: 0.38, premiumDollars: 840, daysToExpiration: 45 },
  { symbol: "ZS", side: "CALL", score: 96,  expectedDollarsPerHour: 180,
    delta: 0.35, premiumDollars: 700, daysToExpiration: 40 },
  { symbol: "NQ", side: "PUT",  score: 82,  expectedDollarsPerHour: 150,
    delta: 0.30, premiumDollars: 1200, daysToExpiration: 50 },
  { symbol: "ES", side: "CALL", score: 45,  expectedDollarsPerHour: 60,
    delta: 0.20, premiumDollars: 950, daysToExpiration: 30 },
];


describe("LadderTable", () => {
  it("sorts rows high-to-low by score", () => {
    render(<LadderTable candidates={[...rows].reverse()} />);
    const rowEls = screen.getAllByTestId(/^ladder-row-/);
    expect(rowEls[0]).toHaveAttribute("data-testid", "ladder-row-CL-CALL");
    expect(rowEls[1]).toHaveAttribute("data-testid", "ladder-row-ZS-CALL");
    expect(rowEls[2]).toHaveAttribute("data-testid", "ladder-row-NQ-PUT");
    expect(rowEls[3]).toHaveAttribute("data-testid", "ladder-row-ES-CALL");
  });

  it("buckets rows correctly by score", () => {
    render(<LadderTable candidates={rows} />);
    expect(screen.getByTestId("ladder-row-CL-CALL"))
      .toHaveAttribute("data-bucket", "confirmed");
    expect(screen.getByTestId("ladder-row-ZS-CALL"))
      .toHaveAttribute("data-bucket", "tradable");
    expect(screen.getByTestId("ladder-row-NQ-PUT"))
      .toHaveAttribute("data-bucket", "watch");
    expect(screen.getByTestId("ladder-row-ES-CALL"))
      .toHaveAttribute("data-bucket", "skip");
  });

  it("reports the tradable count (score >= gate)", () => {
    render(<LadderTable candidates={rows} gate={90} />);
    expect(screen.getByTestId("ladder-table")).toHaveTextContent(/2 tradable/);
  });

  it("shows empty state when no candidates", () => {
    render(<LadderTable candidates={[]} />);
    expect(screen.getByTestId("ladder-table-empty")).toBeInTheDocument();
    expect(screen.getByTestId("ladder-table")).toHaveTextContent(/0 tradable/);
  });

  it("invokes onRowClick when a row is clicked", () => {
    const onClick = jest.fn();
    render(<LadderTable candidates={rows} onRowClick={onClick} />);
    fireEvent.click(screen.getByTestId("ladder-row-CL-CALL"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toMatchObject({ symbol: "CL", side: "CALL" });
  });
});
