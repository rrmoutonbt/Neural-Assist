import { tradesToMarkers, tradesToPriceLines } from "../useLadderOverlay";
import { DARK_PALETTE } from "../theme";
import type { TraceSlipView } from "../types";


const slip = (over: Partial<TraceSlipView> = {}): TraceSlipView => ({
  id: 1, cycle_id: 1, cycle_trade_number: 1,
  symbol: "CL", side: "CALL", contracts: 5,
  entry_price_points: 84, target_price_points: 106.5,
  entry_fill_points: 84, exit_fill_points: 106.5,
  entry_time: "2024-01-15T13:22:00Z", exit_time: "2024-01-17T14:00:00Z",
  days_to_expiration: 45, delta: 0.38,
  ladder_score: 96, realized_pnl_dollars: 1125,
  created_at: "2024-01-15T13:22:00Z", updated_at: "2024-01-17T14:00:00Z",
  ...over,
});


describe("tradesToMarkers", () => {
  it("emits an entry + exit marker per closed trade", () => {
    const markers = tradesToMarkers([slip()], DARK_PALETTE);
    expect(markers).toHaveLength(2);
    const entry = markers.find((m) => m.shape === "arrowUp");
    const exit  = markers.find((m) => m.shape === "circle");
    expect(entry).toBeDefined();
    expect(exit).toBeDefined();
    expect(entry!.time).toBe("2024-01-15");
    expect(exit!.time).toBe("2024-01-17");
    expect(entry!.text).toContain("CALL 5");
    expect(entry!.text).toContain("96");
    expect(exit!.text).toBe("+$1125");
  });

  it("colors PUT entries with brick and points arrows down", () => {
    const [entry] = tradesToMarkers(
      [slip({ side: "PUT", exit_time: null, realized_pnl_dollars: null })],
      DARK_PALETTE,
    );
    expect(entry.shape).toBe("arrowDown");
    expect(entry.color).toBe(DARK_PALETTE.brick);
    expect(entry.position).toBe("aboveBar");
  });

  it("colors losers with brick on the exit marker", () => {
    const markers = tradesToMarkers(
      [slip({ realized_pnl_dollars: -500 })],
      DARK_PALETTE,
    );
    const exit = markers.find((m) => m.shape === "circle")!;
    expect(exit.color).toBe(DARK_PALETTE.brick);
    expect(exit.text).toBe("−$500");
  });

  it("omits the entry marker if entry_time is null", () => {
    const markers = tradesToMarkers(
      [slip({ entry_time: null, exit_time: null, realized_pnl_dollars: null })],
      DARK_PALETTE,
    );
    expect(markers).toHaveLength(0);
  });

  it("sorts markers ascending by time", () => {
    const a = slip({ entry_time: "2024-03-01T00:00:00Z", exit_time: null,
                     realized_pnl_dollars: null, id: 2 });
    const b = slip({ entry_time: "2024-01-15T00:00:00Z", exit_time: null,
                     realized_pnl_dollars: null, id: 1 });
    const markers = tradesToMarkers([a, b], DARK_PALETTE);
    expect(markers.map((m) => m.time)).toEqual(["2024-01-15", "2024-03-01"]);
  });
});


describe("tradesToPriceLines", () => {
  it("emits a target line for every OPEN trade", () => {
    const openTrade  = slip({ exit_time: null, realized_pnl_dollars: null });
    const closedTrade = slip();
    const lines = tradesToPriceLines([openTrade, closedTrade], DARK_PALETTE);
    expect(lines).toHaveLength(1);
    expect(lines[0].price).toBe(106.5);
    expect(lines[0].color).toBe(DARK_PALETTE.amber);
    expect(lines[0].title).toContain("target");
  });

  it("emits no lines when nothing is open", () => {
    expect(tradesToPriceLines([slip()], DARK_PALETTE)).toEqual([]);
  });

  it("skips open trades that lack a target_price_points", () => {
    const open = slip({ exit_time: null, realized_pnl_dollars: null,
                        target_price_points: null });
    expect(tradesToPriceLines([open], DARK_PALETTE)).toEqual([]);
  });
});
