/**
 * LadderTable — daily ranked candidates.
 *
 * A visual translation of the transcript's "ladder": each row is a
 * candidate scored 0-100 with a color-coded score bar. Rows are sorted
 * high-to-low and bucketed:
 *   ≥99.5 confirmed   (sage)
 *   ≥90   tradable    (amber)  ← this is the transcript's gate
 *   ≥75   watch       (slate)
 *   <75   skip        (muted, greyed out)
 *
 * Accepts a `candidates` prop directly (canonical for now) — a live
 * candidates endpoint is out of scope for Sprint 10 Day 3 and will be
 * added when the LadderLiveRunner grows a scored-but-not-yet-executed
 * queue.
 */

import React, { useMemo } from "react";

import {
  MONO_FONT, SANS_FONT, SERIF_FONT, bucketColor, bucketForScore,
  paletteFor, type LadderTheme, type ScoreBucket,
} from "./theme";


export interface LadderCandidateRow {
  symbol: string;
  side: "CALL" | "PUT";
  score: number;                         // 0-100
  expectedDollarsPerHour?: number | null;
  delta?: number | null;
  premiumDollars?: number | null;
  daysToExpiration?: number | null;
  hoursToTarget?: number | null;
}

export interface LadderTableProps {
  candidates: LadderCandidateRow[];
  gate?: number;                         // default 90
  theme?: LadderTheme;
  onRowClick?: (row: LadderCandidateRow) => void;
  emptyMessage?: string;
}


export const LadderTable: React.FC<LadderTableProps> = ({
  candidates,
  gate = 90,
  theme = "dark",
  onRowClick,
  emptyMessage = "No candidates scored yet.",
}) => {
  const palette = useMemo(() => paletteFor(theme), [theme]);
  const sorted = useMemo(
    () => [...candidates].sort((a, b) => b.score - a.score),
    [candidates],
  );

  const tradableCount = sorted.filter((c) => c.score >= gate).length;

  return (
    <div
      data-testid="ladder-table"
      style={{
        background: palette.panel,
        border: `1px solid ${palette.rule}`,
        color: palette.text,
        fontFamily: SANS_FONT,
      }}
    >
      {/* Header strip */}
      <div style={{
        padding: "14px 18px",
        borderBottom: `1px solid ${palette.rule}`,
        display: "flex", alignItems: "baseline", gap: 16,
      }}>
        <div style={{
          fontFamily: MONO_FONT, fontSize: 11,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: palette.muted,
        }}>
          Ladder · today
        </div>
        <div style={{
          fontFamily: SERIF_FONT, fontSize: 16, marginLeft: "auto",
          color: tradableCount > 0 ? palette.amber : palette.muted,
        }}>
          {tradableCount} tradable · gate ≥ {gate}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div
          data-testid="ladder-table-empty"
          style={{
            padding: "26px 20px", color: palette.muted,
            fontFamily: SERIF_FONT, fontStyle: "italic",
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        <table
          style={{
            width: "100%", borderCollapse: "collapse",
            fontFamily: MONO_FONT, fontSize: 13,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <thead>
            <tr style={{ color: palette.muted }}>
              <Th align="left"  palette={palette}>#</Th>
              <Th align="left"  palette={palette}>symbol</Th>
              <Th align="left"  palette={palette}>side</Th>
              <Th align="right" palette={palette}>score</Th>
              <Th align="left"  palette={palette}>&nbsp;</Th>
              <Th align="right" palette={palette}>$/hr</Th>
              <Th align="right" palette={palette}>Δ</Th>
              <Th align="right" palette={palette}>prem</Th>
              <Th align="right" palette={palette}>dte</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <Row
                key={`${c.symbol}-${c.side}-${i}`}
                idx={i + 1}
                row={c}
                bucket={bucketForScore(c.score)}
                palette={palette}
                onClick={onRowClick}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};


const Th: React.FC<React.PropsWithChildren<{
  align: "left" | "right";
  palette: ReturnType<typeof paletteFor>;
}>> = ({ align, palette, children }) => (
  <th style={{
    textAlign: align, padding: "10px 14px",
    fontWeight: 500, fontSize: 11,
    letterSpacing: "0.10em", textTransform: "uppercase",
    borderBottom: `1px solid ${palette.rule}`,
  }}>
    {children}
  </th>
);


const Row: React.FC<{
  idx: number;
  row: LadderCandidateRow;
  bucket: ScoreBucket;
  palette: ReturnType<typeof paletteFor>;
  onClick?: (row: LadderCandidateRow) => void;
}> = ({ idx, row, bucket, palette, onClick }) => {
  const color = bucketColor(bucket, palette);
  const dim = bucket === "skip";
  return (
    <tr
      data-testid={`ladder-row-${row.symbol}-${row.side}`}
      data-bucket={bucket}
      onClick={onClick ? () => onClick(row) : undefined}
      style={{
        cursor: onClick ? "pointer" : "default",
        opacity: dim ? 0.55 : 1,
        borderBottom: `1px solid ${palette.rule}`,
      }}
    >
      <Td align="right" palette={palette} muted>{idx}</Td>
      <Td align="left"  palette={palette}>
        <span style={{ color: palette.text, fontWeight: 600 }}>{row.symbol}</span>
      </Td>
      <Td align="left" palette={palette}>
        <span style={{
          padding: "2px 8px", fontSize: 10, letterSpacing: "0.08em",
          background: row.side === "CALL" ? palette.sage + "33" : palette.brick + "33",
          color:      row.side === "CALL" ? palette.sage : palette.brick,
          border: `1px solid ${row.side === "CALL" ? palette.sage : palette.brick}`,
        }}>
          {row.side}
        </span>
      </Td>
      <Td align="right" palette={palette}>
        <span style={{ color, fontWeight: 600 }}>{row.score.toFixed(1)}</span>
      </Td>
      <Td align="left" palette={palette}>
        <ScoreBar score={row.score} color={color} palette={palette} />
      </Td>
      <Td align="right" palette={palette} muted={dim}>
        {row.expectedDollarsPerHour != null
          ? `$${row.expectedDollarsPerHour.toFixed(0)}`
          : "—"}
      </Td>
      <Td align="right" palette={palette} muted={dim}>
        {row.delta != null ? row.delta.toFixed(2) : "—"}
      </Td>
      <Td align="right" palette={palette} muted={dim}>
        {row.premiumDollars != null
          ? `$${row.premiumDollars.toFixed(0)}`
          : "—"}
      </Td>
      <Td align="right" palette={palette} muted={dim}>
        {row.daysToExpiration != null ? `${row.daysToExpiration}d` : "—"}
      </Td>
    </tr>
  );
};


const Td: React.FC<React.PropsWithChildren<{
  align: "left" | "right";
  palette: ReturnType<typeof paletteFor>;
  muted?: boolean;
}>> = ({ align, palette, muted, children }) => (
  <td style={{
    textAlign: align, padding: "8px 14px",
    color: muted ? palette.muted : palette.text,
  }}>
    {children}
  </td>
);


const ScoreBar: React.FC<{
  score: number;
  color: string;
  palette: ReturnType<typeof paletteFor>;
}> = ({ score, color, palette }) => (
  <div style={{
    display: "inline-block",
    width: 110, height: 6,
    background: palette.rule, position: "relative",
  }}>
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0,
      width: `${Math.max(0, Math.min(100, score))}%`,
      background: color,
    }} />
    {/* Gate tick */}
    <div style={{
      position: "absolute", left: "90%", top: -2, bottom: -2,
      width: 1, background: palette.brick, opacity: 0.7,
    }} />
  </div>
);


export default LadderTable;
