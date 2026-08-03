/**
 * TypeScript shapes mirroring backend-trading-service/ladder_api/serialization.py.
 * Keep in lockstep with that module; the frontend components key off these fields.
 */

export interface OHLCVCandle {
  time: string;        // "YYYY-MM-DD"
  open: number;
  high: number;
  low:  number;
  close: number;
}

export interface VolumeBar {
  time: string;        // "YYYY-MM-DD"
  value: number;
}

export interface BarsPayload {
  symbol: string;
  n: number;
  source: string;      // "synthetic" | "yfinance"
  candles: OHLCVCandle[];
  volume: VolumeBar[];
}

export interface CycleTrade {
  n: number;
  pnl_dollars: number;
  capital_after: number;
  at: string;
  meta: Record<string, unknown>;
}

export interface CycleView {
  cycle_id: number;
  starting_capital: number;
  current_capital: number;
  peak_capital: number;
  drawdown_pct: number;
  per_option_target_dollars: number;
  realized_pnl: number;
  trade_count: number;
  trades_remaining: number;
  cycle_max: number;
  started_at: string | null;
  ended_at:   string | null;
  is_active:  boolean;
  locked:     boolean;
  lock_reason: string | null;
  trades: CycleTrade[];
}

export interface SnapshotResponse {
  cycle: CycleView | null;
  trades?: CycleTrade[];
  empty: boolean;
}

export interface TraceSlipView {
  id: number;
  cycle_id: number;
  cycle_trade_number: number | null;
  symbol: string;
  side: "CALL" | "PUT";
  contracts: number;
  entry_price_points: number | null;
  target_price_points: number | null;
  entry_fill_points: number | null;
  exit_fill_points: number | null;
  entry_time: string | null;
  exit_time: string | null;
  days_to_expiration: number | null;
  delta: number | null;
  ladder_score: number | null;
  realized_pnl_dollars: number | null;
  created_at: string;
  updated_at: string;
}

export interface TradesResponse {
  trades: TraceSlipView[];
  count: number;
  filters: { cycle_id: number | null; symbol: string | null; limit: number };
}

export interface GateSweepRow {
  gate: number;
  n_trades: number;
  n_hits: number;
  hit_rate: number;
  total_pnl: number;
}

export interface GateSweepResponse {
  empty: boolean;
  sweep: GateSweepRow[];
}

export interface MonthlyProfile {
  observed: Record<string, number>;  // JSON stringifies int keys
  expected: Record<string, number>;
  diff:     Record<string, number>;
  correlation: number | null;
  total_observed: number | null;
  total_expected: number | null;
}

export interface MonthlyProfileResponse {
  empty: boolean;
  profile: MonthlyProfile | null;
}

export interface ReportSummary {
  generated_at: string | null;
  test_auc: number | null;
  test_accuracy: number | null;
  test_brier: number | null;
  n_trades: number | null;
  hit_rate: number | null;
  total_pnl: number | null;
  profile_correlation: number | null;
  gate_used: number | null;
}

export interface ReportSummaryResponse {
  empty: boolean;
  summary: ReportSummary | null;
}

export interface HealthResponse {
  ok: boolean;
  db_exists: boolean;
  report_exists: boolean;
  db_path: string;
  report_dir: string;
}
