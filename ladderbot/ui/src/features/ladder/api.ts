/**
 * Typed fetch wrappers for /api/ladder/*.
 * Backend contract lives in backend-trading-service/ladder_api.
 */

import type {
  BarsPayload,
  GateSweepResponse,
  HealthResponse,
  MonthlyProfileResponse,
  ReportSummaryResponse,
  SnapshotResponse,
  TradesResponse,
} from "./types";

export interface LadderApiClientOptions {
  baseUrl?: string;                                        // default: ""
  fetchImpl?: typeof fetch;                                // for tests
  signal?: AbortSignal;
}

export class LadderApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `LadderApi error ${status}`);
    this.status = status;
    this.body = body;
  }
}

export class LadderApiClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: LadderApiClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "").replace(/\/+$/, "");
    // Bind to preserve `this` when fetch is a native browser function.
    const provided = opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
    if (!provided) {
      throw new Error("LadderApiClient: no fetch implementation available");
    }
    this.fetchImpl = provided.bind(globalThis);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/ladder${path}`;
    const res = await this.fetchImpl(url, {
      headers: { Accept: "application/json" },
      ...init,
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!res.ok) {
      throw new LadderApiError(res.status, body);
    }
    return body as T;
  }

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  snapshot(): Promise<SnapshotResponse> {
    return this.request<SnapshotResponse>("/snapshot");
  }

  trades(params: {
    cycleId?: number; symbol?: string; limit?: number;
  } = {}): Promise<TradesResponse> {
    const q = new URLSearchParams();
    if (params.cycleId !== undefined) q.set("cycle_id", String(params.cycleId));
    if (params.symbol) q.set("symbol", params.symbol);
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return this.request<TradesResponse>(`/trades${suffix}`);
  }

  gateSweep(): Promise<GateSweepResponse> {
    return this.request<GateSweepResponse>("/gate-sweep");
  }

  monthlyProfile(): Promise<MonthlyProfileResponse> {
    return this.request<MonthlyProfileResponse>("/monthly-profile");
  }

  reportSummary(): Promise<ReportSummaryResponse> {
    return this.request<ReportSummaryResponse>("/report/summary");
  }

  bars(
    symbol: string,
    opts: { years?: number; source?: "synthetic" | "yfinance" } = {},
  ): Promise<BarsPayload> {
    const q = new URLSearchParams();
    if (opts.years !== undefined) q.set("years", String(opts.years));
    if (opts.source) q.set("source", opts.source);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return this.request<BarsPayload>(`/bars/${encodeURIComponent(symbol)}${suffix}`);
  }
}

/**
 * Convenience singleton for pages that just want the default client.
 * Pass an explicit LadderApiClient(...) when you need to override baseUrl or
 * inject a fetch (tests, SSR).
 */
export const defaultLadderClient = (() => {
  try { return new LadderApiClient(); }
  catch { return null; }
})();
