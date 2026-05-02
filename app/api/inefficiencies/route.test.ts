/** @jest-environment node */

import { GET } from "./route";
import { cached } from "@/lib/redis";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(),
}));

jest.mock("@/lib/pmxt", () => ({
  fetchOhlcv: jest.fn(),
  hasPmxtKey: jest.fn(),
  resolveOhlcvId: jest.fn(),
  router: { markets: jest.fn() },
}));

jest.mock("@/lib/mock", () => ({
  mockMarkets: jest.fn(),
  assignResolutionLabels: jest.fn((markets) => markets),
  mockOhlcv: jest.fn(),
}));

describe("/api/inefficiencies GET", () => {
  test("returns cached inefficiency payload and maps venue urls", async () => {
    (cached as jest.Mock).mockResolvedValue({
      state: "HIT",
      value: {
        source: "mock",
        scores: [
          {
            id: "i1",
            marketId: "m1",
            title: "Will X happen?",
            exchange: "polymarket",
            sourceExchange: "polymarket",
            slug: "will-x-happen",
            category: "Politics",
            type: "liquidity_gap",
            score: 42,
            details: "details",
            lastUpdated: new Date().toISOString(),
          },
        ],
      },
    });

    const res = await GET();
    const body = await res.json();

    expect(body.cache).toBe("HIT");
    expect(body.source).toBe("mock");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].url).toBe("https://polymarket.com/event/will-x-happen");
  });
});
