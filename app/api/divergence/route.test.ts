/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets } from "@/lib/mock";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(async (_key, _ttl, loader) => ({
    value: await loader(),
    state: "MISS",
  })),
}));

jest.mock("@/lib/fetchAll", () => ({
  timed: jest.fn(async (_label, fn) => fn()),
}));

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
}));

jest.mock("@/lib/mock", () => ({
  mockMarkets: jest.fn(),
}));

jest.mock("@/lib/divergence", () => ({
  SIMILARITY_THRESHOLD: 0.5,
  SPREAD_THRESHOLD: 0.02,
  divergentPairsForCategory: jest.fn(async () => []),
  pairMarkets: jest.fn((poly, kalshi, category) =>
    poly.length && kalshi.length
      ? [
          {
            pairId: "p1|k1",
            polyMarketId: "p1",
            kalshiMarketId: "k1",
            polyTitle: "Will BTC rise?",
            kalshiTitle: "Will BTC rise",
            polyYes: 0.6,
            kalshiYes: 0.5,
            spread: 0.1,
            spreadPP: 10,
            similarityScore: 0.8,
            category,
            arbitrageDirection: "buy_kalshi",
            polyVolume24h: 10,
            kalshiVolume24h: 10,
          },
        ]
      : [],
  ),
}));

describe("/api/divergence GET", () => {
  test("returns mock divergence pairs without PMXT key", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    (mockMarkets as jest.Mock).mockReturnValue([
      {
        marketId: "p1",
        title: "Will BTC rise?",
        category: "Crypto",
        exchange: "polymarket",
        sourceExchange: "polymarket",
        volume: 1,
        volume24h: 1,
        liquidity: 1,
        outcomes: [
          { outcomeId: "1", marketId: "p1", label: "Yes", price: 0.6 },
          { outcomeId: "2", marketId: "p1", label: "No", price: 0.4 },
        ],
      },
      {
        marketId: "k1",
        title: "Will BTC rise",
        category: "Crypto",
        exchange: "kalshi",
        sourceExchange: "kalshi",
        volume: 1,
        volume24h: 1,
        liquidity: 1,
        outcomes: [
          { outcomeId: "3", marketId: "k1", label: "Yes", price: 0.5 },
          { outcomeId: "4", marketId: "k1", label: "No", price: 0.5 },
        ],
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/divergence");
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].pairId).toBe("p1|k1");
  });
});
