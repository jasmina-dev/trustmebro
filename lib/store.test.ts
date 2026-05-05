import { act, renderHook } from "@testing-library/react";
import { useDashboard } from "./store";
import type { UnifiedMarket } from "./types";

function sampleMarket(id: string): UnifiedMarket {
  return {
    marketId: id,
    title: `Market ${id}`,
    volume: 500,
    volume24h: 50,
    liquidity: 250,
    exchange: "polymarket",
    category: "Politics",
    outcomes: [
      { outcomeId: `${id}-y`, marketId: id, label: "Yes", price: 0.6 },
      { outcomeId: `${id}-n`, marketId: id, label: "No", price: 0.4 },
    ],
  };
}

describe("lib/store", () => {
  beforeEach(() => {
    useDashboard.setState({
      activeVenue: "all",
      activeCategory: "All",
      activeChart: "overview",
      dateRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-31T00:00:00.000Z",
      },
      visibleMarkets: [],
      inefficiencyScores: [],
      resolutionStats: [],
      chatOpen: false,
      chatMessages: [],
      chatStreaming: false,
    });
  });

  test("filter actions update store state", () => {
    const { result } = renderHook(() => useDashboard());
    act(() => {
      result.current.setVenue("kalshi");
      result.current.setCategory("Crypto");
    });

    expect(result.current.activeVenue).toBe("kalshi");
    expect(result.current.activeCategory).toBe("Crypto");
  });

  test("updateChartContext dedupes visible markets by marketId", () => {
    const { result } = renderHook(() => useDashboard());
    const first = sampleMarket("A");
    const second = sampleMarket("A");
    const third = sampleMarket("B");

    act(() => {
      result.current.updateChartContext("chart-1", { visibleMarkets: [first] });
      result.current.updateChartContext("chart-2", {
        visibleMarkets: [second, third],
      });
    });

    expect(result.current.activeChart).toBe("chart-2");
    expect(result.current.visibleMarkets).toHaveLength(2);
    expect(result.current.visibleMarkets.map((m) => m.marketId)).toEqual([
      "A",
      "B",
    ]);
  });

  test("appendChatAssistantChunk appends only matching message id", () => {
    const { result } = renderHook(() => useDashboard());

    act(() => {
      result.current.addChatMessage({
        id: "assistant-1",
        role: "assistant",
        content: "Hello",
        createdAt: Date.now(),
      });
      result.current.addChatMessage({
        id: "assistant-2",
        role: "assistant",
        content: "World",
        createdAt: Date.now(),
      });
      result.current.appendChatAssistantChunk("assistant-1", " there");
    });

    expect(result.current.chatMessages[0].content).toBe("Hello there");
    expect(result.current.chatMessages[1].content).toBe("World");
  });

  test("updateChartContext enforces context list caps", () => {
    const { result } = renderHook(() => useDashboard());
    const markets = Array.from({ length: 230 }, (_, i) =>
      sampleMarket(String(i)),
    );
    const scores = Array.from({ length: 140 }, (_, i) => ({
      id: `s-${i}`,
      marketId: `m-${i}`,
      title: `Score ${i}`,
      exchange: "polymarket" as const,
      category: "Politics",
      type: "liquidity_gap" as const,
      score: i,
      details: "d",
      lastUpdated: new Date().toISOString(),
    }));

    act(() => {
      result.current.updateChartContext("chart-cap", {
        visibleMarkets: markets,
        inefficiencyScores: scores,
      });
    });

    expect(result.current.visibleMarkets).toHaveLength(200);
    expect(result.current.inefficiencyScores).toHaveLength(100);
  });

  test("getContextSnapshot trims payload for chat prompt safety", () => {
    const { result } = renderHook(() => useDashboard());
    const markets = Array.from({ length: 45 }, (_, i) =>
      sampleMarket(String(i)),
    );

    act(() => {
      result.current.updateChartContext("chart-snap", {
        visibleMarkets: markets,
      });
    });

    const snapshot = result.current.getContextSnapshot();
    expect(snapshot.activeChart).toBe("chart-snap");
    expect(snapshot.visibleMarkets).toHaveLength(30);
  });
});
