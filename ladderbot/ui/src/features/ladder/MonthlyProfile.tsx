/**
 * MonthlyProfile — observed monthly hits vs the transcript's shape.
 *
 * Twelve month-groups, each with paired bars (observed amber, expected
 * slate) and a Pearson-r readout above. Same visual language as the
 * Sprint 9 report artifact.
 *
 * Accepts either a full MonthlyProfile payload or a client that will
 * fetch it. Falls back to empty state on no data.
 */

import React, { useEffect, useMemo, useState } from "react";

import { LadderApiClient, defaultLadderClient } from "./api";
import type { MonthlyProfile as MonthlyProfileData } from "./types";
import {
  MONO_FONT, SANS_FONT, SERIF_FONT, paletteFor, type LadderTheme,
} from "./theme";


export interface MonthlyProfileProps {
  profile?: MonthlyProfileData | null;
  client?: LadderApiClient;
  theme?: LadderTheme;
  height?: number;
}


const MONTHS: [number, string][] = [
  [1, "Jan"], [2, "Feb"], [3, "Mar"], [4, "Apr"],
  [5, "May"], [6, "Jun"], [7, "Jul"], [8, "Aug"],
  [9, "Sep"], [10, "Oct"], [11, "Nov"], [12, "Dec"],
];


export const MonthlyProfile: React.FC<MonthlyProfileProps> = ({
  profile: profileProp,
  client,
  theme = "dark",
  height = 220,
}) => {
  const palette = useMemo(() => paletteFor(theme), [theme]);
  const api = useMemo(() => client ?? defaultLadderClient, [client]);
  const [fetched, setFetched] = useState<MonthlyProfileData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const controlled = profileProp !== undefined;

  useEffect(() => {
    if (controlled || !api) return;
    let cancelled = false;
    api.monthlyProfile()
      .then((r) => { if (!cancelled) { setFetched(r.profile); setError(null); } })
      .catch((e) => { if (!cancelled) setError((e as Error)?.message ?? "load failed"); });
    return () => { cancelled = true; };
  }, [controlled, api]);

  const profile = controlled ? (profileProp ?? null) : (fetched ?? null);

  if (!controlled && fetched === undefined && !error) {
    return <Skeleton palette={palette} label="loading monthly profile…" />;
  }
  if (error) {
    return (
      <Frame palette={palette} data-testid="monthly-profile-error">
        <div style={{ color: palette.brick, fontFamily: MONO_FONT, fontSize: 12 }}>
          {error}
        </div>
      </Frame>
    );
  }
  if (!profile) {
    return (
      <Frame palette={palette} data-testid="monthly-profile-empty">
        <div style={{ color: palette.muted, fontFamily: SERIF_FONT, fontStyle: "italic" }}>
          No completed run yet. The monthly profile lights up after the first
          backtest.
        </div>
      </Frame>
    );
  }

  const maxCount = Math.max(
    1,
    ...MONTHS.map(([m]) =>
      Math.max(
        profile.observed[String(m)] ?? 0,
        profile.expected[String(m)] ?? 0,
      ),
    ),
  );

  // SVG layout
  const w = 780;
  const h = height;
  const plotTop = 32, plotBottom = h - 30, plotLeft = 44, plotRight = w - 16;
  const plotH = plotBottom - plotTop;
  const monthW = (plotRight - plotLeft) / MONTHS.length;
  const barW = Math.max(6, (monthW - 12) / 2);

  const bars: React.ReactNode[] = [];
  MONTHS.forEach(([m, label], i) => {
    const obs = profile.observed[String(m)] ?? 0;
    const exp = profile.expected[String(m)] ?? 0;
    const cx = plotLeft + i * monthW + monthW / 2;
    const yObs = plotBottom - (obs / maxCount) * plotH;
    const yExp = plotBottom - (exp / maxCount) * plotH;
    bars.push(
      <g key={m}>
        <rect x={cx - barW - 1} y={yObs} width={barW}
              height={plotBottom - yObs}
              fill={palette.amber}
              data-testid={`monthly-obs-${m}`} />
        <rect x={cx + 1} y={yExp} width={barW}
              height={plotBottom - yExp}
              fill={palette.slate} fillOpacity={0.55}
              data-testid={`monthly-exp-${m}`} />
        <text x={cx} y={h - 10} textAnchor="middle"
              fontFamily={MONO_FONT} fontSize={10} fill={palette.muted}>
          {label}
        </text>
      </g>,
    );
  });

  // y-axis ticks (nice-ish)
  const yTicks = 4;
  const ticks: React.ReactNode[] = [];
  for (let k = 0; k <= yTicks; k++) {
    const v = (maxCount * k) / yTicks;
    const y = plotBottom - (v / maxCount) * plotH;
    ticks.push(
      <g key={k}>
        <line x1={plotLeft} y1={y} x2={plotRight} y2={y}
              stroke={palette.rule} strokeWidth={0.5} />
        <text x={plotLeft - 8} y={y + 3} textAnchor="end"
              fontFamily={MONO_FONT} fontSize={10} fill={palette.muted}>
          {Math.round(v)}
        </text>
      </g>,
    );
  }

  const r = profile.correlation;
  const rLabel = r == null || Number.isNaN(r) ? "—" : r.toFixed(3);
  const rColor =
    r == null ? palette.muted :
    r >= 0.5 ? palette.sage :
    r >= 0.2 ? palette.amber :
    palette.brick;

  return (
    <Frame palette={palette} data-testid="monthly-profile">
      <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginBottom: 10 }}>
        <div style={{
          fontFamily: MONO_FONT, fontSize: 11,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: palette.muted,
        }}>
          Monthly hits · observed vs transcript
        </div>
        <div style={{
          marginLeft: "auto",
          fontFamily: MONO_FONT, fontSize: 12,
          color: palette.muted,
        }}>
          Pearson r ={" "}
          <span data-testid="monthly-profile-correlation"
                style={{ color: rColor, fontWeight: 600 }}>
            {rLabel}
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
             role="img" aria-label="Monthly hits vs transcript profile">
          {ticks}
          {bars}
        </svg>
      </div>

      <div style={{
        display: "flex", gap: 20, marginTop: 8,
        fontFamily: MONO_FONT, fontSize: 11, color: palette.muted,
      }}>
        <Legend swatch={palette.amber} label="observed" />
        <Legend swatch={palette.slate} label="transcript profile" opacity={0.55} />
        {profile.total_observed != null && profile.total_expected != null && (
          <div style={{ marginLeft: "auto" }}>
            {profile.total_observed} obs · {profile.total_expected} expected
          </div>
        )}
      </div>
    </Frame>
  );
};


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


const Skeleton: React.FC<{
  palette: ReturnType<typeof paletteFor>; label: string;
}> = ({ palette, label }) => (
  <div
    data-testid="monthly-profile-loading"
    style={{
      background: palette.panel,
      border: `1px solid ${palette.rule}`,
      padding: "18px 20px",
      color: palette.muted,
      fontFamily: MONO_FONT, fontSize: 12,
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}
  >
    {label}
  </div>
);


const Legend: React.FC<{ swatch: string; label: string; opacity?: number }> = ({
  swatch, label, opacity = 1,
}) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
    <span style={{
      display: "inline-block", width: 14, height: 8,
      background: swatch, opacity,
    }} />
    <span>{label}</span>
  </span>
);


export default MonthlyProfile;
