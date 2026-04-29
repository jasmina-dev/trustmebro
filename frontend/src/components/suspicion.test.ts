// utilized cursor to generate tests

import { computeEventSuspicion } from "./suspicion";
import type { PolymarketEvent, TradesAnalytics } from "../api/client";

function makeEvent(overrides?: Partial<PolymarketEvent>): PolymarketEvent {
  return {
    id: "evt-1",
    title: "Event A",
    markets: [{ id: "m1", question: "Q", conditionId: "c1" }],
    ...overrides,
  };
}

function makeTrades(overrides?: Partial<TradesAnalytics>): TradesAnalytics {
  return {
    totalTrades: 10,
    totalVolume: 1000,
    uniqueTraders: 2,
    uniqueMarkets: 2,
    timeRange: { earliest: "", latest: "" },
    byTime: [],
    perMarket: [{ conditionId: "c1", volume: 100, tradeCount: 3 }],
    whaleTraders: [
      { address: "0x1", volume: 120, tradeCount: 1, shareOfTotalVolume: 0.12 },
    ],
    preDeadlineWindow: {
      windowHours: 24,
      windowStart: "",
      windowEnd: "",
      volume: 100,
      tradeCount: 2,
      shareOfTotalVolume: 0.1,
    },
    ...overrides,
  };
}

const baseOpts = {
  highVolumeEventIds: new Set<string>(),
  inconsistentTitles: new Set<string>(),
  chartVolumeRank: 5,
  totalChartBars: 12,
};

describe("computeEventSuspicion", () => {
  it("returns high for explicit high-volume id or inconsistent title flags", () => {
    expect(
      computeEventSuspicion(makeEvent({ id: "flagged" }), {
        ...baseOpts,
        trades: makeTrades(),
        highVolumeEventIds: new Set(["flagged"]),
      }),
    ).toBe("high");

    expect(
      computeEventSuspicion(makeEvent({ title: "Bad title" }), {
        ...baseOpts,
        trades: makeTrades(),
        inconsistentTitles: new Set(["Bad title"]),
      }),
    ).toBe("high");
  });

  it("returns high when share is very large", () => {
    const trades = makeTrades({
      totalVolume: 1000,
      perMarket: [{ conditionId: "c1", volume: 180, tradeCount: 2 }],
    });
    expect(computeEventSuspicion(makeEvent(), { ...baseOpts, trades })).toBe(
      "high",
    );
  });

  it("returns high for whale concentration signal", () => {
    const trades = makeTrades({
      totalVolume: 1000,
      perMarket: [{ conditionId: "c1", volume: 70, tradeCount: 2 }],
      whaleTraders: [
        { address: "0x1", volume: 200, tradeCount: 2, shareOfTotalVolume: 0.2 },
      ],
    });
    expect(
      computeEventSuspicion(makeEvent(), {
        ...baseOpts,
        trades,
        chartVolumeRank: 1,
      }),
    ).toBe("high");
  });

  it("returns medium for moderate share, late burst, or top rank fallback", () => {
    expect(
      computeEventSuspicion(makeEvent(), {
        ...baseOpts,
        trades: makeTrades({
          totalVolume: 1000,
          perMarket: [{ conditionId: "c1", volume: 90, tradeCount: 2 }],
        }),
      }),
    ).toBe("medium");

    expect(
      computeEventSuspicion(makeEvent(), {
        ...baseOpts,
        trades: makeTrades({
          totalVolume: 1000,
          perMarket: [{ conditionId: "c1", volume: 60, tradeCount: 2 }],
          preDeadlineWindow: {
            windowHours: 24,
            windowStart: "",
            windowEnd: "",
            volume: 290,
            tradeCount: 2,
            shareOfTotalVolume: 0.29,
          },
        }),
      }),
    ).toBe("medium");

    expect(
      computeEventSuspicion(makeEvent(), {
        ...baseOpts,
        trades: makeTrades({
          totalVolume: 1000,
          perMarket: [{ conditionId: "c1", volume: 10, tradeCount: 2 }],
        }),
        chartVolumeRank: 0,
      }),
    ).toBe("medium");
  });

  it("returns low when no stronger signals are present", () => {
    const trades = makeTrades({
      totalVolume: 2000,
      perMarket: [{ conditionId: "c1", volume: 40, tradeCount: 2 }],
      whaleTraders: [
        { address: "0x1", volume: 50, tradeCount: 1, shareOfTotalVolume: 0.03 },
      ],
      preDeadlineWindow: {
        windowHours: 24,
        windowStart: "",
        windowEnd: "",
        volume: 100,
        tradeCount: 2,
        shareOfTotalVolume: 0.1,
      },
    });
    expect(computeEventSuspicion(makeEvent(), { ...baseOpts, trades })).toBe(
      "low",
    );
  });
});
