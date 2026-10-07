/**
 * OptionsCompounder — reinvestment calculator panel.
 *
 * Reproduces the compounding spreadsheet inside the LadderBot dashboard.
 * Pure client-side math; no backend calls needed.
 */

import React, { useCallback, useMemo, useState } from "react";

import {
  MONO_FONT, paletteFor, type LadderTheme,
} from "./theme";


export interface OptionsCompounderProps {
  theme?: LadderTheme;
}


interface CompounderInputs {
  start: number;
  perOption: number;
  makePer: number;
  cycles: number;
  whole: boolean;
}

interface CompounderRow {
  trade: number;
  opts: number;
  cost: number;
  profit: number;
  reinvest: number;
  nextOpts: number;
}

interface CompounderResult {
  rows: CompounderRow[];
  finalBalance: number;
  gain: number;
  multiple: number;
}

const DEFAULTS: CompounderInputs = {
  start: 20000,
  perOption: 1000,
  makePer: 225,
  cycles: 12,
  whole: false,
};

const BALANCE_CAP = 1e30;


function runCompounder(inputs: CompounderInputs): CompounderResult {
  const { start, perOption, makePer, cycles, whole } = inputs;
  const rate = makePer / perOption;
  let cash = start;
  const rows: CompounderRow[] = [];

  for (let i = 0; i < cycles; i++) {
    if (cash > BALANCE_CAP) break;

    let opts: number;
    let cost: number;
    let leftover: number;

    if (whole) {
      opts = Math.floor(cash / perOption);
      cost = opts * perOption;
      leftover = cash - cost;
    } else {
      opts = Math.round(cash / perOption);
      cost = cash;
      leftover = 0;
    }

    const profit = cost * rate;
    const reinvest = cost + profit + leftover;

    const nextOpts = whole
      ? Math.floor(reinvest / perOption)
      : Math.round(reinvest / perOption);

    rows.push({ trade: i + 1, opts, cost, profit, reinvest, nextOpts });
    cash = reinvest;
  }

  const finalBalance = rows.length > 0 ? rows[rows.length - 1].reinvest : start;
  const gain = finalBalance - start;
  const multiple = start > 0 ? finalBalance / start : 0;

  return { rows, finalBalance, gain, multiple };
}


function money(x: number): string {
  return "$" + x.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


export const OptionsCompounder: React.FC<OptionsCompounderProps> = ({
  theme = "dark",
}) => {
  const palette = useMemo(() => paletteFor(theme), [theme]);

  const [inputs, setInputs] = useState<CompounderInputs>({ ...DEFAULTS });
  const [texts, setTexts] = useState({
    start: String(DEFAULTS.start),
    perOption: String(DEFAULTS.perOption),
    makePer: String(DEFAULTS.makePer),
    cycles: String(DEFAULTS.cycles),
  });
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => {
    if (inputs.perOption <= 0) return null;
    if (inputs.start <= 0) return null;
    if (inputs.cycles < 1 || inputs.cycles > 1000) return null;
    if (inputs.makePer < 0) return null;
    return runCompounder(inputs);
  }, [inputs]);

  const handleTextChange = useCallback((field: string, raw: string) => {
    setTexts((prev) => ({ ...prev, [field]: raw }));
  }, []);

  const handleCommit = useCallback((field: keyof CompounderInputs, raw: string) => {
    setError(null);
    const cleaned = raw.replace(/[$,]/g, "");

    if (field === "whole") return;

    if (field === "cycles") {
      const n = parseInt(cleaned, 10);
      if (isNaN(n) || n < 1) {
        setError("Trades must be at least 1");
        return;
      }
      if (n > 1000) {
        setError("Trades must be at most 1,000");
        return;
      }
      setInputs((prev) => ({ ...prev, cycles: n }));
      return;
    }

    const val = parseFloat(cleaned);
    if (isNaN(val)) {
      setError(`Invalid number for ${field}`);
      return;
    }

    if (field === "perOption" && val <= 0) {
      setError("Cost per option must be greater than 0");
      return;
    }
    if (field === "start" && val <= 0) {
      setError("Starting amount must be greater than 0");
      return;
    }

    setInputs((prev) => ({ ...prev, [field]: val }));
  }, []);

  const handleReset = useCallback(() => {
    setInputs({ ...DEFAULTS });
    setTexts({
      start: String(DEFAULTS.start),
      perOption: String(DEFAULTS.perOption),
      makePer: String(DEFAULTS.makePer),
      cycles: String(DEFAULTS.cycles),
    });
    setError(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (!result) return;
    const header = "Trade\tOptions\tPer Option\tCost\tMake Per\tProfit\tReinvest\tNext";
    const lines = result.rows.map((r) =>
      `${r.trade}\t${r.opts}\t${inputs.perOption.toFixed(2)}\t${r.cost.toFixed(2)}\t${inputs.makePer.toFixed(2)}\t${r.profit.toFixed(2)}\t${r.reinvest.toFixed(2)}\t${r.nextOpts}`
    );
    const summary = `\nPUT IN: ${inputs.start.toFixed(2)}\tFINAL: ${result.finalBalance.toFixed(2)}\tGAIN: ${result.gain.toFixed(2)}\t(${result.multiple.toFixed(2)}x)`;
    navigator.clipboard?.writeText([header, ...lines, summary].join("\n"));
  }, [result, inputs.start, inputs.perOption, inputs.makePer]);

  // ── styles ──

  const inputStyle: React.CSSProperties = {
    background: palette.panelStrong,
    color: palette.text,
    border: `1px solid ${palette.rule}`,
    padding: "6px 10px",
    fontFamily: MONO_FONT,
    fontSize: 13,
    width: 130,
    borderRadius: 2,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: "0.06em",
    color: palette.muted,
    marginBottom: 4,
  };

  const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    fontFamily: MONO_FONT,
    fontSize: 12,
    cursor: "pointer",
    border: `1px solid ${palette.rule}`,
    borderRadius: 2,
  };

  return (
    <div style={{ background: palette.panel, border: `1px solid ${palette.rule}`, padding: 20 }}>
      {/* Title */}
      <div style={{
        fontFamily: MONO_FONT, fontSize: 10,
        letterSpacing: "0.16em", textTransform: "uppercase",
        color: palette.muted, marginBottom: 14,
      }}>
        Options Compounder · reinvestment calculator
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div style={labelStyle}>Starting amount</div>
          <input
            style={inputStyle}
            value={texts.start}
            onChange={(e) => handleTextChange("start", e.target.value)}
            onBlur={(e) => handleCommit("start", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div>
          <div style={labelStyle}>Cost per option</div>
          <input
            style={inputStyle}
            value={texts.perOption}
            onChange={(e) => handleTextChange("perOption", e.target.value)}
            onBlur={(e) => handleCommit("perOption", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div>
          <div style={labelStyle}>Profit per option</div>
          <input
            style={inputStyle}
            value={texts.makePer}
            onChange={(e) => handleTextChange("makePer", e.target.value)}
            onBlur={(e) => handleCommit("makePer", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div>
          <div style={labelStyle}>Trades</div>
          <input
            style={{ ...inputStyle, width: 70 }}
            value={texts.cycles}
            onChange={(e) => handleTextChange("cycles", e.target.value)}
            onBlur={(e) => handleCommit("cycles", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 2 }}>
          <input
            type="checkbox"
            id="whole-contracts"
            checked={inputs.whole}
            onChange={(e) => setInputs((prev) => ({ ...prev, whole: e.target.checked }))}
            style={{ accentColor: palette.amber }}
          />
          <label htmlFor="whole-contracts" style={{
            fontFamily: MONO_FONT, fontSize: 12, color: palette.textSoft, cursor: "pointer",
          }}>
            Whole contracts only
          </label>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={handleReset}
            style={{ ...btnStyle, background: "transparent", color: palette.textSoft }}
          >
            Reset
          </button>
          <button
            onClick={handleCopy}
            style={{ ...btnStyle, background: "transparent", color: palette.textSoft }}
          >
            Copy
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          color: palette.brick, fontFamily: MONO_FONT, fontSize: 12,
          marginBottom: 10, padding: "4px 8px",
          border: `1px solid ${palette.brick}`, background: palette.panelStrong,
        }}>
          {error}
        </div>
      )}

      {/* Results table */}
      {result && result.rows.length > 0 && (
        <>
          <div style={{
            maxHeight: 360, overflowY: "auto",
            border: `1px solid ${palette.rule}`,
          }}>
            <table style={{
              width: "100%", borderCollapse: "collapse",
              fontFamily: MONO_FONT, fontSize: 12,
            }}>
              <thead>
                <tr style={{
                  background: palette.panelStrong,
                  position: "sticky", top: 0, zIndex: 1,
                }}>
                  {["Trade", "Options", "Per Option", "Cost", "Make Per", "Profit", "Reinvest", "Next"].map((h) => (
                    <th key={h} style={{
                      padding: "8px 10px", textAlign: "right",
                      color: palette.muted, fontWeight: 500,
                      fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                      borderBottom: `1px solid ${palette.rule}`,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={row.trade}
                    style={{
                      background: i % 2 === 0 ? palette.panel : palette.panelStrong,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = palette.rule)}
                    onMouseLeave={(e) => (e.currentTarget.style.background =
                      i % 2 === 0 ? palette.panel : palette.panelStrong)}
                  >
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.textSoft }}>
                      {row.trade}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.text }}>
                      {row.opts}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.textSoft }}>
                      {money(inputs.perOption)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.text }}>
                      {money(row.cost)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.textSoft }}>
                      {money(inputs.makePer)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.sage }}>
                      {money(row.profit)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.amber, fontWeight: 500 }}>
                      {money(row.reinvest)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: palette.textSoft }}>
                      {row.nextOpts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div style={{
            display: "flex", gap: 24, flexWrap: "wrap",
            marginTop: 14, padding: "10px 14px",
            background: palette.panelStrong,
            border: `1px solid ${palette.rule}`,
            fontFamily: MONO_FONT, fontSize: 13,
          }}>
            <span style={{ color: palette.muted }}>
              PUT IN <span style={{ color: palette.text, marginLeft: 6 }}>{money(inputs.start)}</span>
            </span>
            <span style={{ color: palette.muted }}>
              FINAL <span style={{ color: palette.amber, marginLeft: 6, fontWeight: 600 }}>{money(result.finalBalance)}</span>
            </span>
            <span style={{ color: palette.muted }}>
              GAIN <span style={{ color: palette.sage, marginLeft: 6 }}>{money(result.gain)}</span>
            </span>
            <span style={{ color: palette.muted }}>
              MULTIPLE <span style={{ color: palette.text, marginLeft: 6 }}>{result.multiple.toFixed(2)}x</span>
            </span>
            {inputs.whole && (
              <span style={{ color: palette.slate, fontSize: 11 }}>
                whole contracts · leftover carried
              </span>
            )}
          </div>

          {/* Disclaimer */}
          <div style={{
            marginTop: 10, fontFamily: MONO_FONT, fontSize: 11,
            color: palette.muted, fontStyle: "italic",
          }}>
            Assumes every trade wins. One loss at full size can undo several rows of gains.
          </div>
        </>
      )}
    </div>
  );
};

export default OptionsCompounder;
