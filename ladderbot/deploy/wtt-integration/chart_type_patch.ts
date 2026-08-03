/**
 * Ladder chart-type registration for WTT.
 *
 * Overlaid to <wtt>/src/features/ladder/chart_type_patch.ts. Exports:
 *
 *   - LADDER_CHART_TYPE_ID: the string key to register in WTT's chart
 *     type registry.
 *   - LadderChartEntry: renders <LadderDashboard/> at whatever mount
 *     point WTT already uses for a full-page chart.
 *   - registerLadderChartType(registry): idempotent registration
 *     helper. Call once from wherever WTT wires its other chart
 *     types (typically src/chart-types/FinalChartTypes.ts or the
 *     bootstrap module).
 *
 * WTT's chart-type registry shape isn't fixed in this repo — the
 * helper accepts a duck-typed { register(id, entry) } object. Adjust
 * the call site if your registry API differs.
 */

import React from "react";
import { LadderDashboard } from "./LadderDashboard";
import { LadderApiClient } from "./api";

export const LADDER_CHART_TYPE_ID = "ladderbot";

export interface LadderChartEntryProps {
  symbol?: string;
  apiBaseUrl?: string;
  theme?: "light" | "dark";
  pollIntervalMs?: number;
}

/**
 * Full-page chart entry — WTT can mount this at whatever route it uses
 * for a chart type that owns its whole viewport.
 */
export const LadderChartEntry: React.FC<LadderChartEntryProps> = ({
  symbol = "CL",
  apiBaseUrl = "",
  theme = "dark",
  pollIntervalMs = 15000,
}) => {
  const client = React.useMemo(
    () => new LadderApiClient({ baseUrl: apiBaseUrl }),
    [apiBaseUrl],
  );
  return (
    <LadderDashboard
      symbol={symbol}
      client={client}
      theme={theme}
      pollIntervalMs={pollIntervalMs}
    />
  );
};

/**
 * Idempotent registration. Registry is expected to expose
 * `.register(id, entry)`; adjust for your codebase.
 */
export function registerLadderChartType(
  registry: { register: (id: string, entry: unknown) => void },
): void {
  registry.register(LADDER_CHART_TYPE_ID, {
    id:          LADDER_CHART_TYPE_ID,
    label:       "LadderBot · gate ≥ 90",
    description: "Futures-options ladder: score gate + 12-trade cycle + fixed target.",
    component:   LadderChartEntry,
    fullPage:    true,
    icon:        "🪜",
  });
}
