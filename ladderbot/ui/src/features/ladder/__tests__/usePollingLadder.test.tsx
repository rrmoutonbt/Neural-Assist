import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { LadderApiClient } from "../api";
import { usePollingLadder } from "../usePollingLadder";
import type { LadderPollState } from "../usePollingLadder";


const sampleCycle = { cycle_id: 1, trade_count: 2, cycle_max: 12 };
const sampleProfile = { correlation: 0.225, observed: {}, expected: {}, diff: {},
                        total_observed: 10, total_expected: 12 };
const sampleSummary = { test_auc: 0.565, hit_rate: 0.829, gate_used: 60,
                        generated_at: null, test_accuracy: null, test_brier: null,
                        n_trades: null, total_pnl: null, profile_correlation: null };


const jsonResp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });


const scriptedFetch = (script: Record<string, () => Response>) =>
  jest.fn(async (url: any) => {
    const u = new URL(url.toString(), "http://localhost");
    const key = Object.keys(script).find((k) => u.pathname.endsWith(k));
    if (!key) throw new Error(`no handler for ${u.pathname}`);
    return script[key]();
  });


let hookState: LadderPollState | undefined;
const Probe: React.FC<{ opts: Parameters<typeof usePollingLadder>[0] }> = ({ opts }) => {
  hookState = usePollingLadder(opts);
  return null;
};


describe("usePollingLadder", () => {
  beforeEach(() => { hookState = undefined; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it("fetches all three endpoints once and stores results", async () => {
    const fetchImpl = scriptedFetch({
      "/snapshot":        () => jsonResp({ cycle: sampleCycle, empty: false }),
      "/monthly-profile": () => jsonResp({ empty: false, profile: sampleProfile }),
      "/report/summary":  () => jsonResp({ empty: false, summary: sampleSummary }),
    });
    const client = new LadderApiClient({ fetchImpl: fetchImpl as any });
    render(<Probe opts={{ client, intervalMs: 0 }} />);
    await waitFor(() => {
      expect(hookState?.cycle).toEqual(sampleCycle);
    });
    expect(hookState?.profile).toEqual(sampleProfile);
    expect(hookState?.summary).toEqual(sampleSummary);
    expect(hookState?.error).toBeNull();
    expect(hookState?.lastUpdated).toBeGreaterThan(0);
  });

  it("re-polls at intervalMs and updates state", async () => {
    let counter = 0;
    const fetchImpl = jest.fn(async (url: any) => {
      counter++;
      const u = new URL(url.toString(), "http://localhost");
      if (u.pathname.endsWith("/snapshot"))
        return jsonResp({ cycle: { ...sampleCycle, trade_count: counter }, empty: false });
      if (u.pathname.endsWith("/monthly-profile"))
        return jsonResp({ empty: false, profile: sampleProfile });
      return jsonResp({ empty: false, summary: sampleSummary });
    });
    const client = new LadderApiClient({ fetchImpl: fetchImpl as any });
    render(<Probe opts={{ client, intervalMs: 1000 }} />);
    await waitFor(() => expect(hookState?.cycle).toBeTruthy());
    const firstCount = (hookState!.cycle as any).trade_count;

    await act(async () => { jest.advanceTimersByTime(1000); });
    await waitFor(() =>
      expect((hookState!.cycle as any).trade_count).toBeGreaterThan(firstCount),
    );
  });

  it("exposes an error state when a fetch rejects", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResp({ error: "boom" }, 500),
    );
    const client = new LadderApiClient({ fetchImpl: fetchImpl as any });
    render(<Probe opts={{ client, intervalMs: 0 }} />);
    await waitFor(() => expect(hookState?.error).toBeTruthy());
    expect(hookState?.cycle).toBeNull();
  });

  it("refresh() forces a re-fetch", async () => {
    let count = 0;
    const fetchImpl = jest.fn(async (url: any) => {
      const u = new URL(url.toString(), "http://localhost");
      if (u.pathname.endsWith("/snapshot")) {
        count++;
        return jsonResp({ cycle: { ...sampleCycle, trade_count: count }, empty: false });
      }
      if (u.pathname.endsWith("/monthly-profile"))
        return jsonResp({ empty: false, profile: sampleProfile });
      return jsonResp({ empty: false, summary: sampleSummary });
    });
    const client = new LadderApiClient({ fetchImpl: fetchImpl as any });
    render(<Probe opts={{ client, intervalMs: 0 }} />);
    await waitFor(() => expect(hookState?.cycle).toBeTruthy());
    const first = (hookState!.cycle as any).trade_count;
    await act(async () => { hookState!.refresh(); });
    await waitFor(() =>
      expect((hookState!.cycle as any).trade_count).toBeGreaterThan(first),
    );
  });

  it("respects enabled=false — never fetches", async () => {
    const fetchImpl = jest.fn(async () => jsonResp({}));
    const client = new LadderApiClient({ fetchImpl: fetchImpl as any });
    render(<Probe opts={{ client, intervalMs: 1000, enabled: false }} />);
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(hookState?.loading).toBe(false);
  });
});
