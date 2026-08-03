import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MonthlyProfile } from "../MonthlyProfile";
import { LadderApiClient } from "../api";
import type { MonthlyProfile as Data } from "../types";


const sample: Data = {
  observed: { "1": 18, "5": 31, "6": 23, "10": 24 },
  expected: { "1": 6,  "5": 10, "6": 12, "10": 15 },
  diff:     { "1": 12, "5": 21, "6": 11, "10": 9  },
  correlation: 0.225,
  total_observed: 96,
  total_expected: 43,
};


describe("MonthlyProfile", () => {
  it("renders 12 observed + 12 expected bars", () => {
    render(<MonthlyProfile profile={sample} />);
    for (let m = 1; m <= 12; m++) {
      expect(screen.getByTestId(`monthly-obs-${m}`)).toBeInTheDocument();
      expect(screen.getByTestId(`monthly-exp-${m}`)).toBeInTheDocument();
    }
  });

  it("shows the Pearson correlation from the payload", () => {
    render(<MonthlyProfile profile={sample} />);
    expect(screen.getByTestId("monthly-profile-correlation"))
      .toHaveTextContent("0.225");
  });

  it("shows the empty message when profile is null", () => {
    render(<MonthlyProfile profile={null} />);
    expect(screen.getByTestId("monthly-profile-empty")).toBeInTheDocument();
  });

  it("shows an em-dash when correlation is null", () => {
    render(<MonthlyProfile profile={{
      ...sample, correlation: null,
    }} />);
    expect(screen.getByTestId("monthly-profile-correlation"))
      .toHaveTextContent("—");
  });

  it("fetches from client when no profile prop is supplied", async () => {
    const client = new LadderApiClient({
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({
          empty: false, profile: sample,
        }), { status: 200 })),
    });
    render(<MonthlyProfile client={client} />);
    await waitFor(() =>
      expect(screen.getByTestId("monthly-profile")).toBeInTheDocument(),
    );
  });
});
