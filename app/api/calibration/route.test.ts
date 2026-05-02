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

describe("/api/calibration GET", () => {
  test("returns calibration series from mock resolved markets", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);
    (mockMarkets as jest.Mock).mockReturnValue([
      {
        marketId: "c1",
        title: "Will X happen?",
        status: "resolved",
        exchange: "polymarket",
        category: "Politics",
        volume: 1,
        volume24h: 1,
        liquidity: 1,
        outcomes: [
          { outcomeId: "1", marketId: "c1", label: "Yes", price: 0.9 },
          { outcomeId: "2", marketId: "c1", label: "No", price: 0.1 },
        ],
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty("buckets");
  });
});
