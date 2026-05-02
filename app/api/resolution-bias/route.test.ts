/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET } from "./route";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets, mockResolutionBuckets } from "@/lib/mock";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(async (_key, _ttl, loader) => ({
    value: await loader(),
    state: "MISS",
  })),
}));

jest.mock("@/lib/fetchAll", () => ({
  fetchAllMarkets: jest.fn(),
  timed: jest.fn(async (_label, fn) => fn()),
}));

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
}));

jest.mock("@/lib/mock", () => ({
  mockMarkets: jest.fn(),
  assignResolutionLabels: jest.fn((markets) => markets),
  mockResolutionBuckets: jest.fn(),
}));

describe("/api/resolution-bias GET", () => {
  test("returns computed buckets from mock markets without PMXT key", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    (mockMarkets as jest.Mock).mockReturnValue([
      {
        marketId: "r1",
        title: "Will event happen?",
        exchange: "polymarket",
        category: "Politics",
        volume: 1,
        volume24h: 1,
        liquidity: 1,
        outcomes: [
          { outcomeId: "1", marketId: "r1", label: "Yes", price: 0.9 },
          { outcomeId: "2", marketId: "r1", label: "No", price: 0.1 },
        ],
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/resolution-bias");
    const res = await GET(req);
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("falls back to BYPASS payload on errors", async () => {
    (hasPmxtKey as jest.Mock).mockImplementation(() => {
      throw new Error("boom");
    });
    (mockResolutionBuckets as jest.Mock).mockReturnValue([]);

    const req = new NextRequest("http://localhost:3000/api/resolution-bias");
    const res = await GET(req);
    const body = await res.json();

    expect(body.cache).toBe("BYPASS");
    expect(body.source).toBe("mock");
    expect(body.error).toContain("boom");
  });
});
