/** @jest-environment node */

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
  fetchAllMarkets: jest.fn(),
}));

jest.mock("@/lib/pmxt", () => ({
  hasPmxtKey: jest.fn(),
}));

jest.mock("@/lib/mock", () => ({
  mockMarkets: jest.fn(),
  assignResolutionLabels: jest.fn((markets) => markets),
}));

describe("/api/efficiency-timeline GET", () => {
  test("returns mock timeline when PMXT key is missing", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    (mockMarkets as jest.Mock).mockReturnValue([
      {
        marketId: "e1",
        title: "Will X happen?",
        status: "resolved",
        resolutionDate: "2026-01-15T00:00:00.000Z",
        exchange: "polymarket",
        category: "Politics",
        volume: 100,
        volume24h: 10,
        liquidity: 10,
        outcomes: [
          { outcomeId: "1", marketId: "e1", label: "Yes", price: 0.9 },
          { outcomeId: "2", marketId: "e1", label: "No", price: 0.1 },
        ],
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(Array.isArray(body.data)).toBe(true);
  });
});
