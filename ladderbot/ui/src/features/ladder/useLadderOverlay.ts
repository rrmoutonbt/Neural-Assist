/**
 * useLadderOverlay — turn TraceSlip records into chart markers + price lines.
 *
 * Pass the returned {markers, priceLines} straight to LadderOHLCVChart.
 * Keeps overlay logic OUT of the chart component: the chart renders what
 * it's told, this hook decides what to tell it.
 */

import { useEffect, useMemo, useState } from "react";

import { LadderApiClient, defaultLadderClient } from "./api";
import type { ChartMarker, ChartPriceLine } from "./LadderOHLCVChart";
import { paletteFor, type LadderTheme } from "./theme";
import type { TraceSlipView } from "./types";


export interface UseLadderOverlayOptions {
  symbol: string;
  trades?: TraceSlipView[];       // pre-supplied (tests / server render)
  client?: LadderApiClient;       // used when trades not supplied
  cycleId?: number;
  limit?: number;
  showTargetLines?: boolean;
  theme?: LadderTheme;
  pollIntervalMs?: number;
}

export interface LadderOverlay {
  markers: ChartMarker[];
  priceLines: ChartPriceLine[];
  trades: TraceSlipView[];
  loading: boolean;
  error: string | null;
}


export function useLadderOverlay(opts: UseLadderOverlayOptions): LadderOverlay {
  const {
    symbol, trades: tradesProp, client, cycleId, limit = 100,
    showTargetLines = true, theme = "dark", pollIntervalMs = 0,
  } = opts;

  const palette = useMemo(() => paletteFor(theme), [theme]);
  const api = useMemo(() => client ?? defaultLadderClient, [client]);
  const controlled = tradesProp !== undefined;

  const [fetched, setFetched] = useState<TraceSlipView[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (controlled || !api) return;
    let cancelled = false;
    const tick = () =>
      api.trades({ symbol, cycleId, limit })
        .then((r) => { if (!cancelled) { setFetched(r.trades); setError(null); } })
        .catch((e) => { if (!cancelled) setError((e as Error)?.message ?? "load failed"); });
    tick();
    if (pollIntervalMs > 0) {
      const h = setInterval(tick, pollIntervalMs);
      return () => { cancelled = true; clearInterval(h); };
    }
    return () => { cancelled = true; };
  }, [controlled, api, symbol, cycleId, limit, pollIntervalMs]);

  const trades = controlled ? (tradesProp ?? []) : (fetched ?? []);
  const scoped = trades.filter((t) => t.symbol === symbol);

  const markers = useMemo<ChartMarker[]>(
    () => tradesToMarkers(scoped, palette),
    [scoped, palette],
  );

  const priceLines = useMemo<ChartPriceLine[]>(
    () => (showTargetLines ? tradesToPriceLines(scoped, palette) : []),
    [scoped, palette, showTargetLines],
  );

  return {
    markers, priceLines, trades: scoped,
    loading: !controlled && fetched === undefined && !error,
    error,
  };
}


// ---------------------------------------------------------------------------
// pure transforms (exported for direct unit-testing)
// ---------------------------------------------------------------------------

export function tradesToMarkers(
  trades: TraceSlipView[],
  palette: ReturnType<typeof paletteFor>,
): ChartMarker[] {
  const out: ChartMarker[] = [];
  for (const t of trades) {
    if (t.entry_time) {
      const isCall = t.side === "CALL";
      out.push({
        time: dateOnly(t.entry_time) as any,
        position: isCall ? "belowBar" : "aboveBar",
        color: isCall ? palette.sage : palette.brick,
        shape: isCall ? "arrowUp" : "arrowDown",
        text: `${t.side} ${t.contracts}${t.ladder_score != null ? ` · ${t.ladder_score.toFixed(0)}` : ""}`,
      });
    }
    if (t.exit_time && t.realized_pnl_dollars != null) {
      const win = t.realized_pnl_dollars >= 0;
      out.push({
        time: dateOnly(t.exit_time) as any,
        position: t.side === "CALL" ? "aboveBar" : "belowBar",
        color: win ? palette.sage : palette.brick,
        shape: "circle",
        text: `${win ? "+" : "−"}$${Math.abs(t.realized_pnl_dollars).toFixed(0)}`,
      });
    }
  }
  // Lightweight-Charts requires markers sorted ascending by time.
  out.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return out;
}


export function tradesToPriceLines(
  trades: TraceSlipView[],
  palette: ReturnType<typeof paletteFor>,
): ChartPriceLine[] {
  const lines: ChartPriceLine[] = [];
  // Only show target lines for still-open trades — closed trades are
  // already documented by their exit marker.
  for (const t of trades) {
    const open = t.entry_time != null && t.exit_time == null;
    if (open && t.target_price_points != null) {
      lines.push({
        price: t.target_price_points,
        color: palette.amber,
        title: `target · ${t.symbol} ${t.side}`,
      });
    }
  }
  return lines;
}


function dateOnly(ts: string): string {
  // Accepts "2024-01-15" and "2024-01-15T13:22:00Z" alike.
  return ts.slice(0, 10);
}
