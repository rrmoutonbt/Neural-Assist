/**
 * LadderOHLCVChart — TradingView Lightweight Charts front-end for LadderBot.
 *
 * Loads bars from /api/ladder/bars/<symbol>, renders candlesticks + volume,
 * exposes hooks for later overlays (entry/exit markers, target/stop lines,
 * cycle boundaries) added in subsequent sprint days.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

import { LadderApiClient, defaultLadderClient } from "./api";
import type { BarsPayload } from "./types";


export type ChartMarker = SeriesMarker<Time>;

export interface ChartPriceLine {
  price: number;
  color: string;
  title?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: LineStyle;
  axisLabelVisible?: boolean;
}

export interface LadderOHLCVChartProps {
  symbol: string;
  years?: number;
  source?: "synthetic" | "yfinance";
  height?: number;
  theme?: "light" | "dark";
  client?: LadderApiClient;
  onLoaded?: (payload: BarsPayload) => void;
  onError?: (err: unknown) => void;
  /**
   * Entry/exit/target markers rendered on the candle series. Replaced
   * wholesale on every render (Lightweight Charts' setMarkers contract).
   */
  markers?: ChartMarker[];
  /**
   * Horizontal price lines (target, stop, cycle boundaries). Replaced
   * wholesale on every render — the component tracks the created
   * IPriceLine handles and removes them before applying the new set.
   */
  priceLines?: ChartPriceLine[];
}


const LIGHT_PALETTE = {
  background: "#F5F1E8",
  text: "#1A1D24",
  grid: "#DDD6C6",
  border: "#C7C1B3",
  bullBody: "#5C8A6E",
  bearBody: "#C4623D",
  bullBorder: "#4A7358",
  bearBorder: "#A25232",
  bullWick: "#5C8A6E",
  bearWick: "#C4623D",
  volume: "rgba(107, 149, 196, 0.35)",
  crosshair: "#8A8C90",
};

const DARK_PALETTE = {
  background: "#0F1218",
  text: "#E8E6DF",
  grid: "#22262E",
  border: "#2C2F36",
  bullBody: "#7EA88A",
  bearBody: "#C4623D",
  bullBorder: "#5C8A6E",
  bearBorder: "#A25232",
  bullWick: "#7EA88A",
  bearWick: "#C4623D",
  volume: "rgba(107, 149, 196, 0.45)",
  crosshair: "#8A8C90",
};

const paletteFor = (theme: "light" | "dark") =>
  theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;


export const LadderOHLCVChart: React.FC<LadderOHLCVChartProps> = ({
  symbol,
  years = 2,
  source,
  height = 420,
  theme = "dark",
  client,
  onLoaded,
  onError,
  markers,
  priceLines,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLineHandles = useRef<IPriceLine[]>([]);

  const [payload, setPayload] = useState<BarsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => client ?? defaultLadderClient, [client]);
  const palette = useMemo(() => paletteFor(theme), [theme]);

  // ---- data fetch ---------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    if (!api) {
      setError("no LadderApiClient available");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api.bars(symbol, { years, source })
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        setLoading(false);
        onLoaded?.(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err && (err as Error).message) || "failed to load bars");
        setLoading(false);
        onError?.(err);
      });
    return () => { cancelled = true; };
  }, [api, symbol, years, source, onLoaded, onError]);

  // ---- chart lifecycle ----------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: palette.background },
        textColor: palette.text,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border, timeVisible: false, secondsVisible: false },
    });

    const candles = chart.addCandlestickSeries({
      upColor: palette.bullBody,
      downColor: palette.bearBody,
      borderUpColor: palette.bullBorder,
      borderDownColor: palette.bearBorder,
      wickUpColor: palette.bullWick,
      wickDownColor: palette.bearWick,
    });
    const volume = chart.addHistogramSeries({
      color: palette.volume,
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0.0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height, palette]);

  // ---- feed data into the chart ------------------------------------------

  useEffect(() => {
    if (!payload || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    const candles: CandlestickData[] = payload.candles.map((c) => ({
      time: c.time as Time,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    const volume: HistogramData[] = payload.volume.map((v, i) => {
      const c = payload.candles[i];
      const up = c ? c.close >= c.open : true;
      return {
        time: v.time as Time,
        value: v.value,
        color: up ? palette.bullBody + "88" : palette.bearBody + "88",
      };
    });
    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volume);
    chartRef.current?.timeScale().fitContent();
  }, [payload, palette]);

  // ---- markers (entry/exit) ---------------------------------------------

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.setMarkers(markers ?? []);
  }, [markers, payload]);

  // ---- price lines (target / stop / cycle boundaries) --------------------

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const h of priceLineHandles.current) {
      try { series.removePriceLine(h); } catch { /* series may be gone */ }
    }
    priceLineHandles.current = [];
    for (const line of priceLines ?? []) {
      const handle = series.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: line.lineWidth ?? 1,
        lineStyle: line.lineStyle ?? LineStyle.Dashed,
        axisLabelVisible: line.axisLabelVisible ?? true,
        title: line.title ?? "",
      });
      priceLineHandles.current.push(handle);
    }
    return () => {
      // Also clean up on unmount of the effect (before next run) — see setMarkers
      // pattern; we handle the same-run swap above.
    };
  }, [priceLines, payload]);

  // ---- render -------------------------------------------------------------

  return (
    <div style={{ position: "relative", width: "100%", minHeight: height }}>
      <div
        ref={containerRef}
        data-testid="ladder-ohlcv-chart"
        style={{ width: "100%", height }}
      />
      {loading && (
        <div
          data-testid="ladder-ohlcv-loading"
          style={overlayStyle(palette, "loading bars…")}
        >
          loading {symbol}…
        </div>
      )}
      {error && !loading && (
        <div
          data-testid="ladder-ohlcv-error"
          style={overlayStyle(palette, "error")}
        >
          {error}
        </div>
      )}
      {payload && !loading && !error && (
        <div
          data-testid="ladder-ohlcv-meta"
          style={metaStyle(palette)}
        >
          {payload.symbol} · {payload.n} bars · {payload.source}
        </div>
      )}
    </div>
  );
};


const overlayStyle = (p: typeof LIGHT_PALETTE, _kind: string): React.CSSProperties => ({
  position: "absolute", inset: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: p.background + "CC",
  color: p.text,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 13, letterSpacing: "0.05em",
});

const metaStyle = (p: typeof LIGHT_PALETTE): React.CSSProperties => ({
  position: "absolute", top: 8, right: 12,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
  color: p.text, opacity: 0.65,
  pointerEvents: "none",
});

export default LadderOHLCVChart;
