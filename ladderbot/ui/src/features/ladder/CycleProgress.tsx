/**
 * CycleProgress — 12-trade cycle tracker.
 *
 * Twelve dots, one per trade slot. Filled dots show completed trades
 * (sage = winner, brick = loser). Empty dots ahead of the cursor show
 * remaining slots. The 13th slot is drawn deliberately absent — a
 * visual reminder of the transcript's one hard rule.
 *
 * Accepts EITHER a pre-loaded `cycle` prop (tests, storybook) OR a
 * LadderApiClient it will poll from.
 */

import React, { useEffect, useMemo, useState } from "react";

import { LadderApiClient, defaultLadderClient } from "./api";
import type { CycleTrade, CycleView } from "./types";
import {
  MONO_FONT, SANS_FONT, SERIF_FONT, paletteFor, type LadderTheme,
} from "./theme";


export interface CycleProgressProps {
  cycle?: CycleView | null;
  client?: LadderApiClient;
  pollIntervalMs?: number;
  theme?: LadderTheme;
  showPnLSpark?: boolean;
}


export const CycleProgress: React.FC<CycleProgressProps> = ({
  cycle: cycleProp,
  client,
  pollIntervalMs = 0,
  theme = "dark",
  showPnLSpark = true,
}) => {
  const palette = useMemo(() => paletteFor(theme), [theme]);
  const api = useMemo(() => client ?? defaultLadderClient, [client]);
  const [fetched, setFetched] = useState<CycleView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const controlled = cycleProp !== undefined;

  useEffect(() => {
    if (controlled || !api) return;
    let cancelled = false;
    const tick = () =>
      api.snapshot()
        .then((s) => { if (!cancelled) { setFetched(s.cycle); setError(null); } })
        .catch((e) => { if (!cancelled) setError((e as Error)?.message ?? "load failed"); });
    tick();
    if (pollIntervalMs > 0) {
      const h = setInterval(tick, pollIntervalMs);
      return () => { cancelled = true; clearInterval(h); };
    }
    return () => { cancelled = true; };
  }, [controlled, api, pollIntervalMs]);

  const cycle: CycleView | null = controlled ? (cycleProp ?? null) : (fetched ?? null);

  if (!controlled && fetched === undefined && !error) {
    return <Skeleton palette={palette} />;
  }
  if (error) {
    return (
      <Frame palette={palette} data-testid="cycle-progress-error">
        <div style={{ color: palette.brick, fontFamily: MONO_FONT, fontSize: 12 }}>
          {error}
        </div>
      </Frame>
    );
  }
  if (!cycle) {
    return (
      <Frame palette={palette} data-testid="cycle-progress-empty">
        <div style={{ color: palette.muted, fontFamily: SERIF_FONT, fontStyle: "italic" }}>
          No active cycle. Start one to begin the ladder.
        </div>
      </Frame>
    );
  }

  return (
    <Frame palette={palette} data-testid="cycle-progress">
      <Header cycle={cycle} palette={palette} />
      <DotRow cycle={cycle} palette={palette} />
      {showPnLSpark && cycle.trades.length > 0 && (
        <PnLSpark trades={cycle.trades} palette={palette} />
      )}
      {cycle.locked && (
        <div
          data-testid="cycle-progress-locked-banner"
          style={{
            marginTop: 12, padding: "8px 12px",
            background: palette.panelStrong,
            borderLeft: `3px solid ${palette.brick}`,
            fontFamily: MONO_FONT, fontSize: 12, color: palette.brick,
          }}
        >
          CYCLE LOCKED · {cycle.lock_reason ?? "unspecified"}
        </div>
      )}
    </Frame>
  );
};


// ─── sub-components ────────────────────────────────────────────────────────

const Frame: React.FC<React.PropsWithChildren<{
  palette: ReturnType<typeof paletteFor>;
  "data-testid"?: string;
}>> = ({ palette, children, ...rest }) => (
  <div
    {...rest}
    style={{
      background: palette.panel,
      border: `1px solid ${palette.rule}`,
      padding: "18px 20px",
      color: palette.text,
      fontFamily: SANS_FONT,
    }}
  >
    {children}
  </div>
);


const Header: React.FC<{ cycle: CycleView; palette: ReturnType<typeof paletteFor> }> = ({
  cycle, palette,
}) => {
  const pnl = cycle.realized_pnl;
  const pnlColor = pnl >= 0 ? palette.sage : palette.brick;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginBottom: 12 }}>
      <div>
        <div style={{
          fontFamily: MONO_FONT, fontSize: 11,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: palette.muted,
        }}>
          Cycle #{cycle.cycle_id} · trade {cycle.trade_count} of {cycle.cycle_max}
        </div>
        <div style={{
          fontFamily: SERIF_FONT, fontSize: 20, marginTop: 4,
          color: palette.text,
        }}>
          {cycle.trades_remaining} trade{cycle.trades_remaining === 1 ? "" : "s"} remaining
        </div>
      </div>
      <div style={{ marginLeft: "auto", textAlign: "right" }}>
        <div style={{
          fontFamily: MONO_FONT, fontSize: 11,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: palette.muted,
        }}>
          realized
        </div>
        <div style={{
          fontFamily: SERIF_FONT, fontSize: 20, marginTop: 4,
          color: pnlColor, fontVariantNumeric: "tabular-nums",
        }}>
          {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(0)}
        </div>
      </div>
    </div>
  );
};


const DotRow: React.FC<{
  cycle: CycleView;
  palette: ReturnType<typeof paletteFor>;
}> = ({ cycle, palette }) => {
  const byN = new Map<number, CycleTrade>(cycle.trades.map((t) => [t.n, t]));
  const dots: React.ReactNode[] = [];
  for (let i = 1; i <= cycle.cycle_max; i++) {
    const t = byN.get(i);
    let color = palette.rule;              // empty
    let border = palette.muted;
    let title = `Trade ${i} · pending`;
    if (t) {
      color = t.pnl_dollars >= 0 ? palette.sage : palette.brick;
      border = color;
      title = `Trade ${i} · ${t.pnl_dollars >= 0 ? "+" : "−"}$${Math.abs(t.pnl_dollars).toFixed(0)}`;
    } else if (i === cycle.trade_count + 1 && !cycle.locked) {
      border = palette.amber;
      title = `Trade ${i} · next`;
    }
    dots.push(
      <div key={i} title={title}
        data-testid={`cycle-dot-${i}`}
        data-state={t ? (t.pnl_dollars >= 0 ? "win" : "loss") : "pending"}
        style={{
          width: 22, height: 22, borderRadius: 11,
          background: color, border: `2px solid ${border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO_FONT, fontSize: 10, color: t ? palette.background : palette.muted,
          fontWeight: 600,
        }}
      >
        {i}
      </div>,
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {dots}
      <div
        data-testid="cycle-dot-forbidden-13"
        title="No 13th trade — hard rule."
        style={{
          marginLeft: 8, width: 22, height: 22, borderRadius: 11,
          background: "transparent",
          border: `2px dashed ${palette.brick}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO_FONT, fontSize: 10, color: palette.brick,
        }}
      >
        13
      </div>
    </div>
  );
};


const PnLSpark: React.FC<{
  trades: CycleTrade[];
  palette: ReturnType<typeof paletteFor>;
}> = ({ trades, palette }) => {
  const values = trades.map((t) => t.pnl_dollars);
  const cum: number[] = [];
  values.reduce((acc, v, i) => (cum[i] = acc + v), 0);
  if (cum.length < 2) return null;
  const min = Math.min(0, ...cum);
  const max = Math.max(0, ...cum);
  const range = max - min || 1;
  const w = 260, h = 44, pad = 4;
  const step = (w - pad * 2) / (cum.length - 1);
  const points = cum
    .map((c, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (c - min) / range);
      return `${x},${y}`;
    })
    .join(" ");
  const finalColor = cum[cum.length - 1] >= 0 ? palette.sage : palette.brick;
  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        fontFamily: MONO_FONT, fontSize: 10,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: palette.muted,
      }}>
        cumulative
      </div>
      <svg width={w} height={h} data-testid="cycle-pnl-spark">
        <polyline
          fill="none" stroke={finalColor} strokeWidth={1.5}
          points={points}
        />
      </svg>
    </div>
  );
};


const Skeleton: React.FC<{ palette: ReturnType<typeof paletteFor> }> = ({ palette }) => (
  <div
    data-testid="cycle-progress-loading"
    style={{
      background: palette.panel,
      border: `1px solid ${palette.rule}`,
      padding: "18px 20px",
      color: palette.muted,
      fontFamily: MONO_FONT, fontSize: 12,
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}
  >
    loading cycle…
  </div>
);


export default CycleProgress;
