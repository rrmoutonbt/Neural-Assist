import { LadderApiClient, LadderApiError } from "../api";
import type { BarsPayload, SnapshotResponse } from "../types";

const makeFetch = (
  handlers: Record<string, () => { status?: number; body: unknown }>,
): typeof fetch => {
  const fn = jest.fn(async (url: RequestInfo | URL) => {
    const path = new URL(url.toString(), "http://localhost").pathname;
    const search = new URL(url.toString(), "http://localhost").search;
    const key = Object.keys(handlers).find((k) => k === path || path.endsWith(k));
    if (!key) throw new Error(`no handler for ${path}${search}`);
    const { status = 200, body } = handlers[key]();
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return fn as unknown as typeof fetch;
};


describe("LadderApiClient", () => {
  it("hits /api/ladder/snapshot and returns typed payload", async () => {
    const empty: SnapshotResponse = { cycle: null, trades: [], empty: true };
    const client = new LadderApiClient({
      fetchImpl: makeFetch({ "/api/ladder/snapshot": () => ({ body: empty }) }),
    });
    const s = await client.snapshot();
    expect(s.empty).toBe(true);
    expect(s.cycle).toBeNull();
  });

  it("prefixes baseUrl and strips trailing slashes", async () => {
    let calledUrl = "";
    const client = new LadderApiClient({
      baseUrl: "http://api.example.com/",
      fetchImpl: (url: any) => {
        calledUrl = url.toString();
        return Promise.resolve(new Response(JSON.stringify({ ok: true, db_exists: false, report_exists: false, db_path: "", report_dir: "" }), { status: 200 }));
      },
    });
    await client.health();
    expect(calledUrl).toBe("http://api.example.com/api/ladder/health");
  });

  it("builds query strings for bars() correctly", async () => {
    let calledUrl = "";
    const bars: BarsPayload = {
      symbol: "CL", n: 0, source: "synthetic", candles: [], volume: [],
    };
    const client = new LadderApiClient({
      fetchImpl: (url: any) => {
        calledUrl = url.toString();
        return Promise.resolve(new Response(JSON.stringify(bars), { status: 200 }));
      },
    });
    await client.bars("CL", { years: 3, source: "synthetic" });
    expect(calledUrl).toContain("/api/ladder/bars/CL?");
    expect(calledUrl).toContain("years=3");
    expect(calledUrl).toContain("source=synthetic");
  });

  it("URL-encodes the symbol path segment", async () => {
    let calledUrl = "";
    const client = new LadderApiClient({
      fetchImpl: (url: any) => {
        calledUrl = url.toString();
        return Promise.resolve(new Response(JSON.stringify({ symbol: "ES=F", n: 0, source: "synthetic", candles: [], volume: [] }), { status: 200 }));
      },
    });
    await client.bars("ES=F");
    expect(calledUrl).toContain("/api/ladder/bars/ES%3DF");
  });

  it("passes through cycleId/symbol/limit as query params on trades()", async () => {
    let calledUrl = "";
    const client = new LadderApiClient({
      fetchImpl: (url: any) => {
        calledUrl = url.toString();
        return Promise.resolve(new Response(JSON.stringify({ trades: [], count: 0, filters: { cycle_id: null, symbol: null, limit: 50 } }), { status: 200 }));
      },
    });
    await client.trades({ cycleId: 7, symbol: "CL", limit: 25 });
    expect(calledUrl).toContain("cycle_id=7");
    expect(calledUrl).toContain("symbol=CL");
    expect(calledUrl).toContain("limit=25");
  });

  it("throws LadderApiError on non-2xx responses", async () => {
    const client = new LadderApiClient({
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({ error: "no_report_available" }), { status: 404 })),
    });
    await expect(client.snapshot()).rejects.toBeInstanceOf(LadderApiError);
    await expect(client.snapshot()).rejects.toMatchObject({
      status: 404,
      body: { error: "no_report_available" },
    });
  });

  it("throws a readable error when no fetch impl is available", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const originalFetch = g.fetch;
    delete g.fetch;
    try {
      expect(() => new LadderApiClient()).toThrow(/no fetch implementation/);
    } finally {
      g.fetch = originalFetch;
    }
  });
});
