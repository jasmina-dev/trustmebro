import {
  marketsRedisKey,
  marketsTtlSeconds,
  normalizeMarketsForApi,
} from "./marketsCache";

jest.mock("./redis", () => ({
  cached: jest.fn(),
}));
jest.mock("./pmxt", () => ({
  hasPmxtKey: jest.fn(() => false),
  router: { markets: jest.fn() },
}));
jest.mock("./mock", () => ({
  mockMarkets: jest.fn(() => []),
  assignResolutionLabels: jest.fn((m: any) => m),
}));

jest.mock("./utils", () => ({
  marketExchange: jest.fn((m: any) => m.exchange ?? null),
  normalizeCategory: jest.fn((c: any) => (c == null ? "Other" : String(c))),
  venueMarketUrl: jest.fn((m: any) => `url:${m.marketId}`),
}));

/**
 * Unit tests for `lib/marketsCache.ts`.
 *
 * @remarks
 * This suite focuses on pure behavior: cache key construction, TTL selection
 * (including env overrides), and response normalization. Redis integration and
 * upstream PMXT behavior are mocked.
 */
describe("marketsCache", () => {
  const withEnv = async (
    patch: Record<string, string | undefined>,
    fn: () => void | Promise<void>,
  ) => {
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(patch)) prev[k] = process.env[k];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  test("marketsRedisKey is stable and includes segments", () => {
    expect(
      marketsRedisKey({
        exchange: null,
        category: "Politics",
        closed: false,
        query: "btc",
        limit: 500,
      }),
    ).toBe("markets:v3:all:Politics:live:btc:500");

    expect(
      marketsRedisKey({
        exchange: "kalshi",
        closed: true,
        limit: 50,
      }),
    ).toBe("markets:v3:kalshi:all:closed:-:50");
  });

  test("marketsTtlSeconds uses safe defaults when env unset/invalid", async () => {
    await withEnv(
      {
        MARKETS_LIVE_TTL_SECONDS: undefined,
        MARKETS_CLOSED_TTL_SECONDS: undefined,
      },
      () => {
        expect(marketsTtlSeconds(false)).toBe(120);
        expect(marketsTtlSeconds(true)).toBe(3600);
      },
    );

    await withEnv(
      { MARKETS_LIVE_TTL_SECONDS: "abc", MARKETS_CLOSED_TTL_SECONDS: "5" },
      () => {
        expect(marketsTtlSeconds(false)).toBe(120);
        expect(marketsTtlSeconds(true)).toBe(3600);
      },
    );
  });

  test("marketsTtlSeconds clamps to safe ranges", async () => {
    await withEnv(
      {
        MARKETS_LIVE_TTL_SECONDS: "999999",
        MARKETS_CLOSED_TTL_SECONDS: "999999",
      },
      () => {
        expect(marketsTtlSeconds(false)).toBe(3600);
        expect(marketsTtlSeconds(true)).toBe(86400);
      },
    );
  });

  test("normalizeMarketsForApi fills exchange/category/url", () => {
    const res = normalizeMarketsForApi([
      {
        marketId: "m1",
        title: "x",
        category: null,
        volume: 0,
        volume24h: 1,
        liquidity: 2,
        outcomes: [],
        exchange: "polymarket",
      } as any,
    ]);

    expect(res[0]).toEqual(
      expect.objectContaining({
        exchange: "polymarket",
        category: "Other",
        url: "url:m1",
      }),
    );
  });
});
