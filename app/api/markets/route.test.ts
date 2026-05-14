/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { cached } from "@/lib/redis";
import { hasPmxtKey, router } from "@/lib/pmxt";
import { mockMarkets } from "@/lib/mock";

/**
 * Route tests for `GET /api/markets`.
 *
 * @remarks
 * Runs in the Node test environment and mocks Redis + PMXT to validate:
 * - query parsing (exchange/category/closed/limit)
 * - response envelope shape + cache headers
 * - behavior differences between real mode (PMXT key) and mock mode
 */
jest.mock("@/lib/redis", () => ({
  cached: jest.fn(async (_key, _ttl, loader) => ({
    value: await loader(),
    state: "MISS",
  })),
}));

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
  router: {
    markets: jest.fn(),
  },
}));

jest.mock("@/lib/mock", () => ({
  mockMarkets: jest.fn(),
  assignResolutionLabels: jest.fn((markets) => markets),
}));

describe("/api/markets GET", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns normalized mock markets when PMXT key is missing", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    (mockMarkets as jest.Mock).mockReturnValue([
      {
        marketId: "m1",
        title: "Will Team A win?",
        exchange: "polymarket",
        sourceExchange: "polymarket",
        category: "NFL",
        volume: 10,
        volume24h: 5,
        liquidity: 2,
        slug: "team-a-win",
        outcomes: [
          { outcomeId: "o1", marketId: "m1", label: "Yes", price: 0.6 },
          { outcomeId: "o2", marketId: "m1", label: "No", price: 0.4 },
        ],
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/markets?limit=10");
    const res = await GET(req);
    const body = await res.json();

    expect(cached).toHaveBeenCalled();
    expect(body.source).toBe("mock");
    expect(body.cache).toBe("MISS");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].category).toBe("Sports");
    expect(body.data[0].url).toBe("https://polymarket.com/event/team-a-win");
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(res.headers.get("Cache-Control")).toContain("max-age");
  });

  test("uses PMXT router path and filters to requested exchange", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (router.markets as jest.Mock).mockResolvedValue({
      data: [
        {
          marketId: "p1",
          title: "P market",
          sourceExchange: "polymarket",
          category: "Politics",
          volume: 10,
          volume24h: 5,
          liquidity: 2,
          outcomes: [],
        },
        {
          marketId: "k1",
          title: "K market",
          sourceExchange: "kalshi",
          category: "Politics",
          volume: 10,
          volume24h: 7,
          liquidity: 2,
          outcomes: [],
        },
      ],
    });

    const req = new NextRequest(
      "http://localhost:3000/api/markets?exchange=kalshi&category=Politics&limit=5",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("pmxt");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].marketId).toBe("k1");
  });

  test("passes closed and query params into the cache layer", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (router.markets as jest.Mock).mockResolvedValue({ data: [] });

    const req = new NextRequest(
      "http://localhost:3000/api/markets?closed=true&query=election&limit=100",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("pmxt");
    expect(cached).toHaveBeenCalled();
    const keyArg = (cached as jest.Mock).mock.calls[0][0] as string;
    expect(keyArg).toContain(":closed:");
    expect(keyArg).toContain("election");
  });

  test("returns BYPASS 500 payload when cache layer throws", async () => {
    (cached as jest.Mock).mockRejectedValueOnce(new Error("cache down"));
    const req = new NextRequest("http://localhost:3000/api/markets?limit=2");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.cache).toBe("BYPASS");
    expect(body.error).toContain("cache down");
  });
});
