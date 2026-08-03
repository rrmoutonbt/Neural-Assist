/**
 * LadderBot React entry point.
 *
 * Mount target: <div id="root"> in public/ladder.html.
 *
 * Runtime configuration comes from a global window.__LADDER_CONFIG__
 * object that a build/deploy step can inject, or from a small set of
 * URL query params for local dev.
 */

import React from "react";
import { createRoot } from "react-dom/client";

import { LadderApiClient } from "./features/ladder/api";
import { LadderDashboard } from "./features/ladder/LadderDashboard";
import type { LadderTheme } from "./features/ladder/theme";


declare global {
  interface Window {
    __LADDER_CONFIG__?: {
      apiBaseUrl?: string;
      symbol?: string;
      universe?: string[];
      pollIntervalMs?: number;
      theme?: LadderTheme;
    };
  }
}


export interface ResolvedConfig {
  apiBaseUrl: string;
  symbol: string;
  universe: string[];
  pollIntervalMs: number;
  theme: LadderTheme;
}


export function resolveConfig(
  win: Pick<Window, "location"> & { __LADDER_CONFIG__?: Window["__LADDER_CONFIG__"] } =
    typeof window !== "undefined" ? window : ({ location: { search: "" } } as any),
): ResolvedConfig {
  const injected = win.__LADDER_CONFIG__ ?? {};
  const params = new URLSearchParams(win.location?.search ?? "");
  return {
    apiBaseUrl:     params.get("api")      ?? injected.apiBaseUrl    ?? "",
    symbol:         params.get("symbol")   ?? injected.symbol        ?? "CL",
    universe:       parseUniverse(params.get("universe"))
                    ?? injected.universe   ?? ["CL", "NQ", "ES", "GC", "ZS", "ZW", "ZC", "ZO"],
    pollIntervalMs: (parseInt(params.get("poll") ?? "", 10)
                     || injected.pollIntervalMs) ?? 15000,
    theme:          (params.get("theme")   as LadderTheme | null)
                    ?? injected.theme      ?? "dark",
  };
}


function parseUniverse(raw: string | null): string[] | null {
  if (!raw) return null;
  const trimmed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return trimmed.length ? trimmed : null;
}


export function mount(container: Element | DocumentFragment, config: ResolvedConfig): void {
  const client = new LadderApiClient({ baseUrl: config.apiBaseUrl });
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <LadderDashboard
        symbol={config.symbol}
        universe={config.universe}
        client={client}
        pollIntervalMs={config.pollIntervalMs}
        theme={config.theme}
      />
    </React.StrictMode>,
  );
}


// Auto-mount when loaded as an entry bundle (skipped under tests where
// this module is imported for `resolveConfig` in isolation).
if (typeof document !== "undefined") {
  const container = document.getElementById("root");
  if (container) {
    mount(container, resolveConfig());
  }
}
