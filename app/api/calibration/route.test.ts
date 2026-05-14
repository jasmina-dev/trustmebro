/** @jest-environment node */

import { GET } from "./route";
import { cached } from "@/lib/redis";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets } from "@/lib/mock";

/**
 * Route tests for `GET /api/calibration`.
 *
 * @remarks
 * The route computes calibration buckets from closed markets and is expected to
 * return a stable envelope and cache headers. Tests mock upstream fetch and
 * validate mock/real branching via `hasPmxtKey()`.
 */
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

jest.mock("@/lib/analyticsClosedMarkets", () => ({
  CALIBRATION_ROW_CATEGORIES: ["Politics", "Crypto", "Finance", "Other"],
  calibrationRowCategory: jest.requireActual("@/lib/analyticsClosedMarkets")
    .calibrationRowCategory,
  fetchClosedMarketsForAnalytics: jest.fn(),
}));

import { fetchClosedMarketsForAnalytics } from "@/lib/analyticsClosedMarkets";

describe("/api/calibration GET", () => {
  beforeEach(() => {
    (cached as jest.Mock).mockImplementation(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) => ({
        value: await loader(),
        state: "MISS",
      }),
    );
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  test("PMXT path aggregates fetchClosedMarketsForAnalytics slices", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    const closed = [
      {
        marketId: "c2",
        title: "Will Y happen?",
        status: "resolved",
        exchange: "polymarket",
        category: "Politics",
        volume: 1,
        volume24h: 1,
        liquidity: 1,
        outcomes: [
          { outcomeId: "1", marketId: "c2", label: "Yes", price: 0.95 },
          { outcomeId: "2", marketId: "c2", label: "No", price: 0.05 },
        ],
      },
    ];
    (fetchClosedMarketsForAnalytics as jest.Mock).mockResolvedValue(closed);

    const res = await GET();
    const body = await res.json();

    expect(body.source).toBe("pmxt");
    expect(body.cache).toBe("MISS");
    expect(fetchClosedMarketsForAnalytics).toHaveBeenCalled();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("returns empty payload on unexpected errors", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (cached as jest.Mock).mockRejectedValueOnce(new Error("cache"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.error).toBe("cache");
  });
});
