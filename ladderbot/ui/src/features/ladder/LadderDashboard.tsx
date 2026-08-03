/**
 * LadderDashboard — the composed page.
 *
 * One import for a caller. Wires the polling hook, the overlay hook,
 * and every Sprint-10 component into a single mount-ready layout.
 *
 *   <LadderDashboard symbol="CL" />
 *
 * Also drives a symbol picker across a configurable universe so an
 * operator can walk the ladder without unmounting anything.
 */

import React, { useMemo, useState } from "react";

import { CycleProgress } from "./CycleProgress";
import { LadderOHLCVChart } from "./LadderOHLCVChart";
import { LadderTable, type LadderCandidateRow } from "./LadderTable";
import { MonthlyProfile } from "./MonthlyProfile";
import { SummaryStrip } from "./SummaryStrip";
import { LadderApiClient } from "./api";
import {
  MONO_FONT, SANS_FONT, SERIF_FONT, paletteFor, type LadderTheme,
} from "./theme";
import { useLadderOverlay } from "./useLadderOverlay";
import { usePollingLadder } from "./usePollingLadder";


export interface LadderDashboardProps {
  symbol?: string;
  universe?: string[];
  client?: LadderApiClient;
  theme?: LadderTheme;
  pollIntervalMs?: number;
  /** Optional pre-scored candidates; supply if you have a live scoring
      queue. When omitted the LadderTable renders an empty state. */
  candidates?: LadderCandidateRow[];
}


const DEFAULT_UNIVERSE = ["CL", "NQ", "ES", "GC", "ZS", "ZW", "ZC", "ZO"];


export const LadderDashboard: React.FC<LadderDashboardProps> = ({
  symbol: initialSymbol = "CL",
  universe = DEFAULT_UNIVERSE,
  client,
  theme = "dark",
  pollIntervalMs = 15000,
  candidates = [],
}) => {
  const palette = useMemo(() => paletteFor(theme), [theme]);
  const [symbol, setSymbol] = useState(initialSymbol);

  const poll = usePollingLadder({ client, intervalMs: pollIntervalMs });
  const overlay = useLadderOverlay({
    symbol, client,
    cycleId: poll.cycle?.cycle_id,
    pollIntervalMs,
    theme,
  });

  return (
    <div
      data-testid="ladder-dashboard"
      style={{
        background: palette.background,
        color: palette.text,
        fontFamily: SANS_FONT,
        padding: "36px 40px",
        minHeight: "100vh",
      }}
    >
      <Header symbol={symbol} onSymbolChange={setSymbol}
              universe={universe} palette={palette} />

      <SummaryStrip
        cycle={poll.cycle}
        summary={poll.summary}
        lastUpdated={poll.lastUpdated}
        theme={theme}
      />

      {/* Main grid: chart takes the wide column; cycle + monthly stack right */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)",
          gap: 0,
          border: `1px solid ${palette.rule}`,
          borderTop: "none",
        }}
      >
        <div style={{
          borderRight: `1px solid ${palette.rule}`,
          padding: 16, background: palette.panel,
        }}>
          <SectionLabel palette={palette}>OHLCV · signals overlaid</SectionLabel>
          <LadderOHLCVChart
            symbol={symbol}
            client={client}
            markers={overlay.markers}
            priceLines={overlay.priceLines}
            theme={theme}
          />
          {overlay.error && (
            <div style={{
              marginTop: 12, color: palette.brick,
              fontFamily: MONO_FONT, fontSize: 12,
            }}>
              overlay error · {overlay.error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${palette.rule}` }}>
            <SectionLabel palette={palette}>Cycle</SectionLabel>
            <CycleProgress cycle={poll.cycle} theme={theme} />
          </div>
          <div style={{ padding: 16 }}>
            <SectionLabel palette={palette}>Monthly profile</SectionLabel>
            <MonthlyProfile profile={poll.profile} theme={theme} />
          </div>
        </div>
      </div>

      {/* Ladder row — full width below the chart */}
      <div style={{
        marginTop: 24, borderTop: `1px solid ${palette.rule}`,
        paddingTop: 20,
      }}>
        <SectionLabel palette={palette}>Ladder · ranked candidates</SectionLabel>
        <LadderTable candidates={candidates} theme={theme} />
      </div>

      {poll.error && (
        <div
          data-testid="dashboard-poll-error"
          style={{
            marginTop: 20, padding: "10px 14px",
            border: `1px solid ${palette.brick}`,
            background: palette.panel,
            color: palette.brick,
            fontFamily: MONO_FONT, fontSize: 12,
          }}
        >
          polling error · {poll.error}
          <button
            onClick={poll.refresh}
            style={{
              marginLeft: 12, padding: "2px 10px",
              background: "transparent", color: palette.brick,
              border: `1px solid ${palette.brick}`,
              fontFamily: MONO_FONT, fontSize: 11, cursor: "pointer",
            }}
          >
            retry
          </button>
        </div>
      )}
    </div>
  );
};


// ─── header with symbol picker ────────────────────────────────────────────

const Header: React.FC<{
  symbol: string;
  universe: string[];
  onSymbolChange: (s: string) => void;
  palette: ReturnType<typeof paletteFor>;
}> = ({ symbol, universe, onSymbolChange, palette }) => (
  <div style={{
    display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20,
  }}>
    <div>
      <div style={{
        fontFamily: MONO_FONT, fontSize: 11,
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: palette.muted,
      }}>
        LadderBot · v1
      </div>
      <div style={{
        fontFamily: SERIF_FONT, fontSize: 28,
        letterSpacing: "-0.01em", color: palette.text,
      }}>
        The ladder · gate ≥ 90 · 12-trade cycle · fixed target · no stop
      </div>
    </div>

    <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}
         data-testid="dashboard-symbol-picker">
      {universe.map((s) => {
        const active = s === symbol;
        return (
          <button
            key={s}
            onClick={() => onSymbolChange(s)}
            data-testid={`symbol-pick-${s}`}
            data-active={active}
            style={{
              padding: "6px 12px",
              fontFamily: MONO_FONT, fontSize: 12,
              letterSpacing: "0.06em",
              background: active ? palette.amber : "transparent",
              color: active ? palette.background : palette.text,
              border: `1px solid ${active ? palette.amber : palette.rule}`,
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  </div>
);


const SectionLabel: React.FC<React.PropsWithChildren<{
  palette: ReturnType<typeof paletteFor>;
}>> = ({ palette, children }) => (
  <div style={{
    fontFamily: MONO_FONT, fontSize: 10,
    letterSpacing: "0.16em", textTransform: "uppercase",
    color: palette.muted, marginBottom: 10,
  }}>
    {children}
  </div>
);


export default LadderDashboard;
