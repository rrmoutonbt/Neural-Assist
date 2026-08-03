/**
 * SummaryStrip — one horizontal row of the numbers that matter most.
 *
 * Sits at the top of LadderDashboard and answers, at a glance:
 *   - Which cycle am I on, how many trades booked?
 *   - What is the current calibrated model's discriminative power?
 *   - What gate is enforced right now?
 *   - What was the last backtest's hit rate + P&L?
 *
 * Pure presentational — takes CycleView + ReportSummary + lastUpdated
 * (from usePollingLadder) and renders. No fetches.
 */

import React, { useMemo } from "react";

import {
  MONO_FONT, SANS_FONT, SERIF_FONT, paletteFor, type LadderTheme,
} from "./theme";
import type { CycleView, ReportSummary } from "./types";


export interface SummaryStripProps {
  cycle: CycleView | null;
  summary: ReportSummary | null;
  lastUpdated?: number | null;
  theme?: LadderTheme;
}


export const SummaryStrip: React.FC<SummaryStripProps> = ({
  cycle, summary, lastUpdated, theme = "dark",
}) => {
  const palette = useMemo(() => paletteFor(theme), [theme]);

  const cycleLabel  = cycle
    ? `#${cycle.cycle_id} · ${cycle.trade_count}/${cycle.cycle_max}`
    : "—";
  const capitalDelta = cycle
    ? cycle.current_capital - cycle.starting_capital
    : null;

  const gate     = summary?.gate_used;
  const auc      = summary?.test_auc;
  const hitRate  = summary?.hit_rate;
  const pnl      = summary?.total_pnl;

  return (
    <div
      data-testid="summary-strip"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr) auto",
        background: palette.panel,
        border: `1px solid ${palette.rule}`,
        borderBottom: "none",
        fontFamily: SANS_FONT,
        color: palette.text,
      }}
    >
      <Cell palette={palette} label="cycle" value={cycleLabel}
            hint={cycle?.locked ? "locked" : cycle ? `${cycle.trades_remaining} left` : "no active cycle"}
            hintColor={cycle?.locked ? palette.brick : palette.muted} />
      <Cell palette={palette} label="capital"
            value={cycle
              ? `$${Math.round(cycle.current_capital).toLocaleString()}`
              : "—"}
            hint={capitalDelta != null
              ? `${capitalDelta >= 0 ? "+" : "−"}$${Math.abs(capitalDelta).toFixed(0)}`
              : ""}
            hintColor={
              capitalDelta == null ? palette.muted
                : capitalDelta >= 0 ? palette.sage
                : palette.brick
            } />
      <Cell palette={palette} label="gate"
            value={gate != null ? gate.toFixed(0) : "—"}
            hint={gate != null && gate >= 90 ? "transcript rule" : "reduced"}
            hintColor={gate != null && gate >= 90 ? palette.amber : palette.muted} />
      <Cell palette={palette} label="model AUC"
            value={auc != null ? auc.toFixed(3) : "—"}
            hint={aucLabel(auc)}
            hintColor={aucColor(auc, palette)} />
      <Cell palette={palette} label="last backtest"
            value={hitRate != null ? `${(hitRate * 100).toFixed(1)}%` : "—"}
            hint={pnl != null
              ? `${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(0)} pnl`
              : "no run yet"}
            hintColor={
              pnl == null ? palette.muted
                : pnl >= 0 ? palette.sage
                : palette.brick
            } />
      <div
        style={{
          padding: "18px 20px",
          borderLeft: `1px solid ${palette.rule}`,
          display: "flex", flexDirection: "column",
          alignItems: "flex-end", justifyContent: "center",
          fontFamily: MONO_FONT, fontSize: 10,
          letterSpacing: "0.10em", textTransform: "uppercase",
          color: palette.muted,
        }}
      >
        <div>updated</div>
        <div data-testid="summary-strip-timestamp"
             style={{ color: palette.textSoft, marginTop: 2 }}>
          {formatUpdated(lastUpdated)}
        </div>
      </div>
    </div>
  );
};


const Cell: React.FC<{
  palette: ReturnType<typeof paletteFor>;
  label: string;
  value: string;
  hint?: string;
  hintColor?: string;
}> = ({ palette, label, value, hint, hintColor }) => (
  <div style={{
    padding: "18px 20px",
    borderLeft: `1px solid ${palette.rule}`,
    display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{
      fontFamily: MONO_FONT, fontSize: 10,
      letterSpacing: "0.14em", textTransform: "uppercase",
      color: palette.muted,
    }}>
      {label}
    </div>
    <div style={{
      fontFamily: SERIF_FONT, fontSize: 24,
      fontVariantNumeric: "tabular-nums",
      color: palette.text,
    }}>
      {value}
    </div>
    {hint && (
      <div style={{
        fontFamily: MONO_FONT, fontSize: 11,
        color: hintColor ?? palette.muted,
        letterSpacing: "0.04em",
      }}>
        {hint}
      </div>
    )}
  </div>
);


function aucLabel(auc: number | null | undefined): string {
  if (auc == null) return "no model loaded";
  if (auc >= 0.7)  return "strong signal";
  if (auc >= 0.6)  return "moderate signal";
  if (auc >= 0.55) return "weak signal";
  return "near-random";
}

function aucColor(auc: number | null | undefined, p: ReturnType<typeof paletteFor>): string {
  if (auc == null)    return p.muted;
  if (auc >= 0.7)     return p.sage;
  if (auc >= 0.6)     return p.amber;
  if (auc >= 0.55)    return p.slate;
  return p.brick;
}

function formatUpdated(ms: number | null | undefined): string {
  if (ms == null) return "never";
  const seconds = Math.max(0, Math.round((nowMs() - ms) / 1000));
  if (seconds < 5)  return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function nowMs(): number {
  return typeof Date !== "undefined" ? Date.now() : 0;
}


export default SummaryStrip;
