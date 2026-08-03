import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Lightweight Charts needs a real Canvas; jsdom doesn't ship one. Mock the
// module surface we use so we can smoke-test the component's data flow.
jest.mock("lightweight-charts", () => {
  const candles = {
    setData: jest.fn(),
    setMarkers: jest.fn(),
    createPriceLine: jest.fn(() => ({ _id: 1 })),
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

// jsdom lacks ResizeObserver
(global as any).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

import { LadderOHLCVChart } from "../LadderOHLCVChart";
import { LadderApiClient } from "../api";


const fakeBars = {
  symbol: "CL", n: 3, source: "synthetic",
  candles: [
    { time: "2024-01-01", open: 100, high: 101, low: 99,  close: 100.5 },
    { time: "2024-01-02", open: 100.5, high: 102, low: 100, close: 101.5 },
    { time: "2024-01-03", open: 101.5, high: 103, low: 101, close: 102.5 },
  ],
  volume: [
    { time: "2024-01-01", value: 1000 },
    { time: "2024-01-02", value: 1200 },
    { time: "2024-01-03", value: 900  },
  ],
};


const clientReturning = (payload = fakeBars) =>
  new LadderApiClient({
    fetchImpl: () =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
  });


describe("LadderOHLCVChart", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows loading state, then renders the meta strip once bars arrive", async () => {
    render(<LadderOHLCVChart symbol="CL" client={clientReturning()} />);
    expect(screen.getByTestId("ladder-ohlcv-loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("ladder-ohlcv-meta")).toBeInTheDocument();
    });
    expect(screen.getByTestId("ladder-ohlcv-meta"))
      .toHaveTextContent("CL · 3 bars · synthetic");
  });

  it("feeds the candles + volume to the underlying series", async () => {
    const { _spy } = require("lightweight-charts");
    render(<LadderOHLCVChart symbol="CL" client={clientReturning()} />);
    await waitFor(() =>
      expect(_spy.candles.setData).toHaveBeenCalled(),
    );
    expect(_spy.candles.setData).toHaveBeenLastCalledWith([
      { time: "2024-01-01", open: 100, high: 101, low: 99,  close: 100.5 },
      { time: "2024-01-02", open: 100.5, high: 102, low: 100, close: 101.5 },
      { time: "2024-01-03", open: 101.5, high: 103, low: 101, close: 102.5 },
    ]);
    expect(_spy.volume.setData).toHaveBeenCalled();
    const volCall = _spy.volume.setData.mock.calls[0][0];
    expect(volCall).toHaveLength(3);
    expect(volCall[0]).toMatchObject({ time: "2024-01-01", value: 1000 });
  });

  it("renders the error state when the API rejects", async () => {
    const client = new LadderApiClient({
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    });
    render(<LadderOHLCVChart symbol="CL" client={client} />);
    await waitFor(() =>
      expect(screen.getByTestId("ladder-ohlcv-error")).toBeInTheDocument(),
    );
  });

  it("invokes onLoaded with the payload", async () => {
    const onLoaded = jest.fn();
    render(<LadderOHLCVChart symbol="CL" client={clientReturning()} onLoaded={onLoaded} />);
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ symbol: "CL", n: 3 }));
  });
});
