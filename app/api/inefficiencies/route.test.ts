/** @jest-environment node */

import { GET } from "./route";
import { cached } from "@/lib/redis";
import { fetchOhlcv, hasPmxtKey, router } from "@/lib/pmxt";

jest.mock("@/lib/redis", () => ({
  cached: jest.fn(),
}));

jest.mock("@/lib/pmxt", () => ({
  fetchOhlcv: jest.fn(),
  hasPmxtKey: jest.fn(),
  resolveOhlcvId: jest.fn(
    (_m: unknown, yes: { outcomeId: string }) => yes.outcomeId,
  ),
  router: { markets: jest.fn() },
}));

jest.mock("@/lib/mock", () => jest.requireActual("@/lib/mock"));

describe("/api/inefficiencies GET", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cached as jest.Mock).mockImplementation(
      async (_k: string, _ttl: number, loader: () => Promise<unknown>) => ({
        value: await loader(),
        state: "MISS",
      }),
    );
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("mock mode runs full compute pipeline and returns sorted envelope", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(false);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.source).toBe("mock");
    expect(body.cache).toBe("MISS");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(200);
    if (body.data.length > 1) {
      expect(body.data[0].score).toBeGreaterThanOrEqual(body.data[1].score);
    }
    expect(body.data[0]).toMatchObject({
      url: expect.any(String),
      type: expect.any(String),
    });
  });

  test("PMXT mode aggregates router markets and probes OHLCV for late-breaking", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);

    const mk = (id: string, exchange: "polymarket" | "kalshi", i: number) => ({
      marketId: id,
      title: `Shared title probe ${i}`,
      category: "Politics",
      exchange,
      sourceExchange: exchange,
      volume: 1e6,
      volume24h: 800_000,
      liquidity: 50,
      resolutionDate: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      status: "resolved" as const,
      outcomes: [
        {
          outcomeId: `${id}-yes`,
          marketId: id,
          label: "Yes",
          price: 0.99,
        },
        {
          outcomeId: `${id}-no`,
          marketId: id,
          label: "No",
          price: 0.01,
        },
      ],
    });

    const activePool = Array.from({ length: 16 }, (_, i) =>
      mk(`a${i}`, i % 2 === 0 ? "polymarket" : "kalshi", i),
    );
    const resolvedPool = Array.from({ length: 16 }, (_, i) =>
      mk(`r${i}`, i % 2 === 0 ? "polymarket" : "kalshi", i),
    );

    (router.markets as jest.Mock).mockImplementation(
      (params: { closed?: boolean }) => ({
        data: params?.closed ? resolvedPool : activePool,
        meta: {
          count: params?.closed ? resolvedPool.length : activePool.length,
          limit: 500,
          offset: 0,
        },
      }),
    );

    (fetchOhlcv as jest.Mock).mockResolvedValue([
      {
        timestamp: Date.now() - 3_600_000,
        open: 0.5,
        high: 0.55,
        low: 0.45,
        close: 0.2,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("pmxt");
    expect(router.markets).toHaveBeenCalled();
    expect(fetchOhlcv).toHaveBeenCalled();
  });

  test("PMXT mode records late-breaking OHLCV failures without failing the route", async () => {
    (hasPmxtKey as jest.Mock).mockReturnValue(true);

    const mk = (id: string, exchange: "polymarket" | "kalshi", i: number) => ({
      marketId: id,
      title: `Late probe ${i}`,
      category: "Politics",
      exchange,
      sourceExchange: exchange,
      volume: 1e6,
      volume24h: 800_000,
      liquidity: 50,
      resolutionDate: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      status: "resolved" as const,
      outcomes: [
        {
          outcomeId: `${id}-yes`,
          marketId: id,
          label: "Yes",
          price: 0.99,
        },
        {
          outcomeId: `${id}-no`,
          marketId: id,
          label: "No",
          price: 0.01,
        },
      ],
    });

    const activePool = Array.from({ length: 16 }, (_, i) =>
      mk(`a${i}`, i % 2 === 0 ? "polymarket" : "kalshi", i),
    );
    const resolvedPool = Array.from({ length: 16 }, (_, i) =>
      mk(`r${i}`, i % 2 === 0 ? "polymarket" : "kalshi", i),
    );

    (router.markets as jest.Mock).mockImplementation(
      (params: { closed?: boolean }) => ({
        data: params?.closed ? resolvedPool : activePool,
        meta: {
          count: params?.closed ? resolvedPool.length : activePool.length,
          limit: 500,
          offset: 0,
        },
      }),
    );

    (fetchOhlcv as jest.Mock).mockRejectedValue("sidecar unavailable");

    const res = await GET();
    expect(res.status).toBe(200);
    const warn = console.warn as jest.Mock;
    expect(
      warn.mock.calls.some((c) =>
        String(c[0]).includes("[late-breaking] probe skipped"),
      ),
    ).toBe(true);
  });

  test("returns 500 JSON when cached layer throws", async () => {
    (cached as jest.Mock).mockRejectedValueOnce(new Error("cache unavailable"));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.error).toBe("cache unavailable");
    expect(body.cache).toBe("BYPASS");
  });
});
