import { resolveConfig } from "../../../ladder-entry";


describe("resolveConfig", () => {
  it("falls back to sensible defaults", () => {
    const cfg = resolveConfig({ location: { search: "" } } as any);
    expect(cfg.apiBaseUrl).toBe("");
    expect(cfg.symbol).toBe("CL");
    expect(cfg.universe).toEqual(["CL", "NQ", "ES", "GC", "ZS", "ZW", "ZC", "ZO"]);
    expect(cfg.pollIntervalMs).toBe(15000);
    expect(cfg.theme).toBe("dark");
  });

  it("honors an injected window.__LADDER_CONFIG__", () => {
    const cfg = resolveConfig({
      location: { search: "" },
      __LADDER_CONFIG__: {
        apiBaseUrl: "https://api.example.com",
        symbol: "NQ",
        universe: ["NQ", "ES"],
        pollIntervalMs: 5000,
        theme: "light",
      },
    } as any);
    expect(cfg).toEqual({
      apiBaseUrl: "https://api.example.com",
      symbol: "NQ",
      universe: ["NQ", "ES"],
      pollIntervalMs: 5000,
      theme: "light",
    });
  });

  it("URL query params override injected defaults", () => {
    const cfg = resolveConfig({
      location: { search: "?symbol=ZS&universe=CL,ZS&poll=8000&theme=light&api=http://a" },
      __LADDER_CONFIG__: {
        apiBaseUrl: "https://ignored",
        symbol: "NQ",
        universe: ["NQ"],
        theme: "dark",
        pollIntervalMs: 15000,
      },
    } as any);
    expect(cfg.apiBaseUrl).toBe("http://a");
    expect(cfg.symbol).toBe("ZS");
    expect(cfg.universe).toEqual(["CL", "ZS"]);
    expect(cfg.pollIntervalMs).toBe(8000);
    expect(cfg.theme).toBe("light");
  });

  it("ignores blank / malformed universe params", () => {
    const cfg = resolveConfig({ location: { search: "?universe=" } } as any);
    expect(cfg.universe).toEqual(["CL", "NQ", "ES", "GC", "ZS", "ZW", "ZC", "ZO"]);
  });

  it("ignores non-numeric poll values (falls through)", () => {
    const cfg = resolveConfig({
      location: { search: "?poll=abc" },
      __LADDER_CONFIG__: { pollIntervalMs: 9999 },
    } as any);
    expect(cfg.pollIntervalMs).toBe(9999);
  });
});


describe("ladder-entry mount", () => {
  it("mounts LadderDashboard into a supplied container", async () => {
    // Have to jest.doMock lightweight-charts here because the entry
    // module transitively imports the chart.
    jest.resetModules();
    jest.doMock("lightweight-charts", () => ({
      __esModule: true,
      createChart: () => ({
        addCandlestickSeries: () => ({
          setData: jest.fn(), setMarkers: jest.fn(),
          createPriceLine: () => ({}), removePriceLine: jest.fn(),
        }),
        addHistogramSeries: () => ({
          setData: jest.fn(),
          priceScale: () => ({ applyOptions: jest.fn() }),
        }),
        applyOptions: jest.fn(),
        timeScale: () => ({ fitContent: jest.fn() }),
        remove: jest.fn(),
      }),
      CrosshairMode: { Normal: 0 },
      LineStyle: { Dashed: 2, Solid: 0 },
    }));
    (global as any).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
    // The dashboard's polling hook fires real fetches on mount; give it
    // a stub that returns an "empty" body for every endpoint.
    (global as any).fetch = jest.fn(async () =>
      new Response(JSON.stringify({ empty: true }), { status: 200 }),
    );

    const { mount, resolveConfig: rc } = await import("../../../ladder-entry");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mount(container, rc({ location: { search: "" } } as any));

    // React 18 createRoot is async — wait a microtask.
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="ladder-dashboard"]')).toBeTruthy();

    document.body.removeChild(container);
  });
});
