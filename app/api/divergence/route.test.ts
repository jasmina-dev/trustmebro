/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { cached } from "@/lib/redis";
import { divergentPairsForCategory } from "@/lib/divergence";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets } from "@/lib/mock";

/**
 * Route tests for `GET /api/divergence`.
 *
 * @remarks
 * Ensures the route returns a stable envelope and uses the expected "real" vs
 * "mock" divergence sources depending on whether a PMXT key is configured.
 */
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
  beforeEach(() => {
    (cached as jest.Mock).mockImplementation(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) => ({
        value: await loader(),
        state: "MISS",
      }),
    );
    (divergentPairsForCategory as jest.Mock).mockReset();
    (divergentPairsForCategory as jest.Mock).mockResolvedValue([]);
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  test("PMXT mode merges per-category caches and respects limit + meta", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    let call = 0;
    (cached as jest.Mock).mockImplementation(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) => {
        call += 1;
        const pairs = await loader();
        return {
          value: pairs,
          state: call % 2 === 0 ? ("HIT" as const) : ("MISS" as const),
        };
      },
    );
    (divergentPairsForCategory as jest.Mock).mockImplementation(async () => [
      {
        pairId: "a|b",
        polyMarketId: "a",
        kalshiMarketId: "b",
        polyTitle: "t",
        kalshiTitle: "t",
        polyYes: 0.7,
        kalshiYes: 0.4,
        spread: 0.3,
        spreadPP: 30,
        similarityScore: 0.9,
        category: "Crypto",
        arbitrageDirection: "buy_kalshi" as const,
        polyVolume24h: 1,
        kalshiVolume24h: 1,
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/divergence?limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("pmxt");
    expect(body.data.length).toBeLessThanOrEqual(5);
    expect(body.meta.totalPairs).toBeGreaterThan(0);
    expect(body.meta.threshold).toBeDefined();
  });

  test("filters mock pairs when category query is set", async () => {
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

    const req = new NextRequest(
      "http://localhost:3000/api/divergence?category=Politics",
    );
    const res = await GET(req);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  test("returns empty data with error message when inner pipeline throws", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (cached as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const req = new NextRequest("http://localhost:3000/api/divergence");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.error).toBe("boom");
    expect(body.cache).toBe("BYPASS");
  });
});
