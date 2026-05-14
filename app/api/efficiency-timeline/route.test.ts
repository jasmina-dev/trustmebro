/** @jest-environment node */

import { GET } from "./route";
import { cached } from "@/lib/redis";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets } from "@/lib/mock";
import { fetchClosedMarketsForAnalytics } from "@/lib/analyticsClosedMarkets";

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
  fetchClosedMarketsForAnalytics: jest.fn(),
}));

describe("/api/efficiency-timeline GET", () => {
  beforeEach(() => {
    (cached as jest.Mock).mockImplementation(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) => ({
        value: await loader(),
        state: "MISS",
      }),
    );
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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
      {
        marketId: "e2",
        title: "Bad date row",
        status: "resolved",
        resolutionDate: "not-a-date",
        exchange: "polymarket",
        category: "Politics",
        volume: 50,
        volume24h: 5,
        liquidity: 5,
        outcomes: [
          { outcomeId: "3", marketId: "e2", label: "Yes", price: 0.9 },
          { outcomeId: "4", marketId: "e2", label: "No", price: 0.1 },
        ],
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.coverage.missingResolutionDate).toBeGreaterThanOrEqual(1);
  });

  test("PMXT path merges both venues from fetchClosedMarketsForAnalytics", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (fetchClosedMarketsForAnalytics as jest.Mock).mockImplementation(
      async (ex: string) => [
        {
          marketId: `e-${ex}`,
          title: "Will Z happen?",
          status: "resolved",
          resolutionDate: "2026-02-01T00:00:00.000Z",
          exchange: ex,
          category: "Politics",
          volume: 200,
          volume24h: 20,
          liquidity: 20,
          outcomes: [
            { outcomeId: "1", marketId: `e-${ex}`, label: "Yes", price: 0.92 },
            { outcomeId: "2", marketId: `e-${ex}`, label: "No", price: 0.08 },
          ],
        },
      ],
    );

    const res = await GET();
    const body = await res.json();

    expect(body.source).toBe("pmxt");
    expect(fetchClosedMarketsForAnalytics).toHaveBeenCalled();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("PMXT path returns populated month rows when each venue meets the monthly minimum", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    const mk = (ex: string, mid: string) => ({
      marketId: `${ex}-${mid}`,
      title: `${ex} ${mid}`,
      status: "resolved" as const,
      resolutionDate: "2026-04-05T00:00:00.000Z",
      exchange: ex,
      category: "Politics",
      volume: 100,
      volume24h: 10,
      liquidity: 10,
      outcomes: [
        {
          outcomeId: `y-${mid}`,
          marketId: `${ex}-${mid}`,
          label: "Yes",
          price: 0.93,
        },
        {
          outcomeId: `n-${mid}`,
          marketId: `${ex}-${mid}`,
          label: "No",
          price: 0.07,
        },
      ],
    });
    (fetchClosedMarketsForAnalytics as jest.Mock).mockImplementation(
      async (ex: string) =>
        ex === "polymarket"
          ? [mk("polymarket", "a"), mk("polymarket", "b")]
          : [mk("kalshi", "a"), mk("kalshi", "b")],
    );

    const res = await GET();
    const body = await res.json();

    expect(body.source).toBe("pmxt");
    expect(body.data.length).toBeGreaterThan(0);
    const row = body.data[0] as Record<string, unknown>;
    expect(row.month).toMatch(/^\d{4}-\d{2}$/);
    expect(typeof row.polymarket).toBe("number");
    expect(typeof row.kalshi).toBe("number");
    expect(body.meta.coverage.monthsBelowFloor).toBe(0);
  });

  test("returns empty data on failure inside cache wrapper", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);
    (cached as jest.Mock).mockRejectedValueOnce(new Error("boom"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.error).toBe("boom");
  });
});
