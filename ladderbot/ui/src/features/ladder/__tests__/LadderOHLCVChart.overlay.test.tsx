/**
 * Verify that the extended LadderOHLCVChart pushes markers + price
 * lines into Lightweight Charts on prop change (Day 4 additions).
 */

import React from "react";
import { render, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockPriceLine = { _id: 1 };
jest.mock("lightweight-charts", () => {
  const candles = {
    setData: jest.fn(),
    setMarkers: jest.fn(),
    createPriceLine: jest.fn(() => mockPriceLine),
    removePriceLine: jest.fn(),
  };
  const volume  = { setData: jest.fn(), priceScale: () => ({ applyOptions: jest.fn() }) };
  const chart   = {
    addCandlestickSeries: jest.fn(() => candles),
    addHistogramSeries:   jest.fn(() => volume),
    applyOptions:         jest.fn(),
    timeScale:            () => ({ fitContent: jest.fn() }),
    remove:               jest.fn(),
  };
  return {
    __esModule: true,
    createChart: jest.fn(() => chart),
    CrosshairMode: { Normal: 0 },
    LineStyle: { Dashed: 2, Solid: 0 },
    _spy: { chart, candles, volume },
  };
});

(global as any).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

import { LadderOHLCVChart } from "../LadderOHLCVChart";
import { LadderApiClient } from "../api";


const fakeBars = {
  symbol: "CL", n: 2, source: "synthetic",
  candles: [
    { time: "2024-01-01", open: 100, high: 101, low: 99, close: 100.5 },
    { time: "2024-01-02", open: 100.5, high: 102, low: 100, close: 101.5 },
  ],
  volume: [
    { time: "2024-01-01", value: 1000 },
    { time: "2024-01-02", value: 1200 },
  ],
};


const staticClient = () =>
  new LadderApiClient({
    fetchImpl: () =>
      Promise.resolve(new Response(JSON.stringify(fakeBars), { status: 200 })),
  });


describe("LadderOHLCVChart overlay props", () => {
  afterEach(() => jest.clearAllMocks());

  it("forwards markers[] to candleSeries.setMarkers()", async () => {
    const { _spy } = require("lightweight-charts");
    const markers = [
      { time: "2024-01-01", position: "belowBar", color: "#7EA88A",
        shape: "arrowUp", text: "CALL 5" },
    ];
    render(<LadderOHLCVChart symbol="CL" client={staticClient()}
                             markers={markers as any} />);
    await waitFor(() =>
      expect(_spy.candles.setMarkers).toHaveBeenCalled(),
    );
    const lastCall = _spy.candles.setMarkers.mock.calls.at(-1)[0];
    expect(lastCall[0]).toMatchObject({ shape: "arrowUp", text: "CALL 5" });
  });

  it("creates one price line per priceLines[] entry", async () => {
    const { _spy } = require("lightweight-charts");
    const lines = [
      { price: 106.5, color: "#E8B04A", title: "target · CL CALL" },
      { price: 90.0,  color: "#C4623D", title: "stop"             },
    ];
    render(<LadderOHLCVChart symbol="CL" client={staticClient()}
                             priceLines={lines} />);
    await waitFor(() => {
      expect(_spy.candles.createPriceLine).toHaveBeenCalledTimes(2);
    });
    const first = _spy.candles.createPriceLine.mock.calls[0][0];
    expect(first).toMatchObject({ price: 106.5, title: "target · CL CALL" });
  });

  it("removes previous price lines when the prop changes", async () => {
    const { _spy } = require("lightweight-charts");
    const initial = [{ price: 100, color: "#E8B04A", title: "one" }];
    const next    = [{ price: 110, color: "#E8B04A", title: "two" }];
    const client = staticClient();     // hoist so rerender doesn't re-fetch
    const { rerender } = render(
      <LadderOHLCVChart symbol="CL" client={client} priceLines={initial} />,
    );
    await waitFor(() =>
      expect(_spy.candles.createPriceLine).toHaveBeenCalled(),
    );
    const createsBefore = _spy.candles.createPriceLine.mock.calls.length;
    const removesBefore = _spy.candles.removePriceLine.mock.calls.length;

    await act(async () => {
      rerender(
        <LadderOHLCVChart symbol="CL" client={client} priceLines={next} />,
      );
    });
    // The new price-line prop MUST trigger at least one remove + one create.
    await waitFor(() => {
      expect(_spy.candles.removePriceLine.mock.calls.length)
        .toBeGreaterThan(removesBefore);
      expect(_spy.candles.createPriceLine.mock.calls.length)
        .toBeGreaterThan(createsBefore);
    });
    // And the last created line reflects the new prop.
    const lastCreate = _spy.candles.createPriceLine.mock.calls.at(-1)[0];
    expect(lastCreate).toMatchObject({ price: 110, title: "two" });
  });
});
