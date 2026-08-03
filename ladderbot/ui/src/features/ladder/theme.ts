/**
 * Shared palette + tokens for every LadderBot component.
 *
 * Matches the two published artifacts (architecture diagram + Sprint 9
 * report) so the UI feels of a piece with the design collateral.
 */

export type LadderTheme = "light" | "dark";

export interface Palette {
  background: string;
  panel: string;
  panelStrong: string;
  text: string;
  textSoft: string;
  muted: string;
  rule: string;

  amber: string;    // ladder / bee
  slate: string;    // datasource / neutral chart accent
  violet: string;   // mastery / ml
  sage: string;     // wttracker / hit
  brick: string;    // kill / miss / warn
}

export const LIGHT_PALETTE: Palette = {
  background: "#F5F1E8",
  panel: "#EBE6D8",
  panelStrong: "#E0DAC8",
  text: "#1A1D24",
  textSoft: "#3D4048",
  muted: "#6B6E75",
  rule: "#C7C1B3",

  amber: "#E8B04A",
  slate: "#6B95C4",
  violet: "#A585C0",
  sage: "#7EA88A",
  brick: "#C4623D",
};

export const DARK_PALETTE: Palette = {
  background: "#0F1218",
  panel: "#171B22",
  panelStrong: "#1D222B",
  text: "#E8E6DF",
  textSoft: "#B8B5A9",
  muted: "#8A8C90",
  rule: "#2C2F36",

  amber: "#E8B04A",
  slate: "#6B95C4",
  violet: "#A585C0",
  sage: "#7EA88A",
  brick: "#C4623D",
};

export const paletteFor = (theme: LadderTheme): Palette =>
  theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;

/**
 * Score → semantic bucket per the transcript:
 *   100 = confirmed setup, 90-99 = tradable, 75-89 = watch, <75 = skip.
 */
export type ScoreBucket = "confirmed" | "tradable" | "watch" | "skip";

export const bucketForScore = (score: number): ScoreBucket => {
  if (score >= 99.5) return "confirmed";
  if (score >= 90)   return "tradable";
  if (score >= 75)   return "watch";
  return "skip";
};

export const bucketColor = (bucket: ScoreBucket, p: Palette): string => {
  switch (bucket) {
    case "confirmed": return p.sage;
    case "tradable":  return p.amber;
    case "watch":     return p.slate;
    case "skip":      return p.muted;
  }
};

export const MONO_FONT =
  'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const SERIF_FONT =
  'Georgia, "Times New Roman", serif';
export const SANS_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
