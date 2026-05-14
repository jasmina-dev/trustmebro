import { fetchAllMarkets, timed } from "./fetchAll";
import { cached } from "./redis";
import { router } from "./pmxt";

jest.mock("./redis", () => ({
  cached: jest.fn(),
}));

jest.mock("./pmxt", () => ({
  router: {
    markets: jest.fn(),
  },
}));

/**
 * Unit tests for `lib/fetchAll.ts`.
 *
 * @remarks
 * The key invariant: pagination termination is driven by the upstream Router
 * page size (`apiRowCount`), not by the filtered/normalized row count.
 */
describe("fetchAll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("logs a one-line summary after fetch completes", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    (cached as jest.Mock).mockResolvedValue({
      value: { markets: [], apiRowCount: 0 },
      state: "MISS",
    });
    await fetchAllMarkets({
      exchange: "polymarket",
      closed: false,
      maxPages: 1,
    });
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/\[fetchAll\]/));
    spy.mockRestore();
  });

  test("fetchAllMarkets paginates using apiRowCount (not filtered row count)", async () => {
    // First page returns 500 rows (full page) but only 1 market after filtering.
    // Second page returns <500 => stop.
    (cached as jest.Mock)
      .mockResolvedValueOnce({
        value: { markets: [{ marketId: "m1" }], apiRowCount: 500 },
        state: "MISS",
      })
      .mockResolvedValueOnce({
        value: { markets: [{ marketId: "m2" }], apiRowCount: 12 },
        state: "HIT",
      });

    // Router shouldn't be called because cached is mocked to resolve pages directly,
    // but the function under test still provides a compute fn; assert that our code
    // uses cached per page key.
    const res = await fetchAllMarkets({
      exchange: "polymarket",
      category: "Politics",
      closed: false,
      maxPages: 10,
      ttlSeconds: 60,
    });

    expect(res.markets.map((m) => m.marketId)).toEqual(["m1", "m2"]);
    expect(res.pagesFetched).toBe(2);
    expect(res.fromCache).toBe(1);

    const keys = (cached as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(keys[0]).toContain("raw:v5:live:polymarket:Politics");
    expect(keys[1]).toContain(":500"); // second page offset
  });

  test("uses default TTLs when ttlSeconds omitted", async () => {
    (cached as jest.Mock).mockResolvedValue({
      value: { markets: [], apiRowCount: 0 },
      state: "MISS",
    });
    await fetchAllMarkets({ exchange: "polymarket", closed: false });
    expect((cached as jest.Mock).mock.calls[0][1]).toBe(120);

    (cached as jest.Mock).mockClear();
    (cached as jest.Mock).mockResolvedValue({
      value: { markets: [], apiRowCount: 0 },
      state: "MISS",
    });
    await fetchAllMarkets({ exchange: "polymarket", closed: true });
    expect((cached as jest.Mock).mock.calls[0][1]).toBe(3600);
  });

  test("honors explicit ttlSeconds override", async () => {
    (cached as jest.Mock).mockResolvedValue({
      value: { markets: [], apiRowCount: 0 },
      state: "MISS",
    });
    await fetchAllMarkets({
      exchange: "kalshi",
      closed: false,
      ttlSeconds: 999,
    });
    expect((cached as jest.Mock).mock.calls[0][1]).toBe(999);
  });

  test("invokes router.markets inside cache loader and stamps exchange", async () => {
    (cached as jest.Mock).mockImplementation(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) => ({
        value: await loader(),
        state: "MISS",
      }),
    );
    (router.markets as jest.Mock).mockResolvedValue({
      data: [
        {
          marketId: "x1",
          title: "T",
          category: null,
          volume: 1,
          volume24h: 1,
          liquidity: 1,
          outcomes: [],
        },
      ],
      meta: { count: 1, limit: 500, offset: 0 },
    });

    const res = await fetchAllMarkets({
      exchange: "polymarket",
      category: "Crypto",
      closed: true,
      maxPages: 1,
      ttlSeconds: 60,
    });

    expect(router.markets).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: "polymarket",
        category: "Crypto",
        closed: true,
        limit: 500,
        offset: 0,
      }),
    );
    expect(res.markets[0]).toMatchObject({
      marketId: "x1",
      exchange: "polymarket",
      category: "Crypto",
    });
  });

  test("fetchAllMarkets honors maxPages hard cap", async () => {
    (cached as jest.Mock).mockResolvedValue({
      value: { markets: [{ marketId: "m" }], apiRowCount: 500 },
      state: "MISS",
    });

    const res = await fetchAllMarkets({
      exchange: "kalshi",
      closed: false,
      maxPages: 3,
      ttlSeconds: 60,
    });

    expect(res.pagesFetched).toBe(3);
    expect(res.markets.length).toBe(3);
  });

  test("timed logs success and returns value", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const out = await timed("x", async () => 123);
    expect(out).toBe(123);
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/\[timing\] x \d+ms/),
    );
    spy.mockRestore();
  });

  test("timed logs failure and rethrows", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      timed("x", async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/\[timing\] x FAILED after \d+ms/),
    );
    spy.mockRestore();
  });
});

describe("fetchAll TTL env parsing", () => {
  const origLive = process.env.RAW_PAGE_LIVE_TTL_SECONDS;
  const origClosed = process.env.RAW_PAGE_CLOSED_TTL_SECONDS;

  afterEach(() => {
    if (origLive === undefined) delete process.env.RAW_PAGE_LIVE_TTL_SECONDS;
    else process.env.RAW_PAGE_LIVE_TTL_SECONDS = origLive;
    if (origClosed === undefined)
      delete process.env.RAW_PAGE_CLOSED_TTL_SECONDS;
    else process.env.RAW_PAGE_CLOSED_TTL_SECONDS = origClosed;
    jest.resetModules();
  });

  test("uses custom live TTL when env is valid", async () => {
    jest.isolateModules(async () => {
      process.env.RAW_PAGE_LIVE_TTL_SECONDS = "240";
      const { fetchAllMarkets } = require("./fetchAll");
      const { cached } = require("./redis");
      (cached as jest.Mock).mockResolvedValue({
        value: { markets: [], apiRowCount: 0 },
        state: "MISS",
      });
      await fetchAllMarkets({
        exchange: "polymarket",
        closed: false,
        maxPages: 1,
      });
      expect((cached as jest.Mock).mock.calls[0][1]).toBe(240);
    });
  });

  test("falls back when live TTL env is invalid", async () => {
    jest.isolateModules(async () => {
      process.env.RAW_PAGE_LIVE_TTL_SECONDS = "not-a-number";
      const { fetchAllMarkets } = require("./fetchAll");
      const { cached } = require("./redis");
      (cached as jest.Mock).mockResolvedValue({
        value: { markets: [], apiRowCount: 0 },
        state: "MISS",
      });
      await fetchAllMarkets({
        exchange: "polymarket",
        closed: false,
        maxPages: 1,
      });
      expect((cached as jest.Mock).mock.calls[0][1]).toBe(120);
    });
  });

  test("uses custom closed TTL when env is valid", async () => {
    jest.isolateModules(async () => {
      process.env.RAW_PAGE_CLOSED_TTL_SECONDS = "7200";
      const { fetchAllMarkets } = require("./fetchAll");
      const { cached } = require("./redis");
      (cached as jest.Mock).mockResolvedValue({
        value: { markets: [], apiRowCount: 0 },
        state: "MISS",
      });
      await fetchAllMarkets({ exchange: "kalshi", closed: true, maxPages: 1 });
      expect((cached as jest.Mock).mock.calls[0][1]).toBe(7200);
    });
  });

  test("falls back when closed TTL env is too small", async () => {
    jest.isolateModules(async () => {
      process.env.RAW_PAGE_CLOSED_TTL_SECONDS = "30";
      const { fetchAllMarkets } = require("./fetchAll");
      const { cached } = require("./redis");
      (cached as jest.Mock).mockResolvedValue({
        value: { markets: [], apiRowCount: 0 },
        state: "MISS",
      });
      await fetchAllMarkets({ exchange: "kalshi", closed: true, maxPages: 1 });
      expect((cached as jest.Mock).mock.calls[0][1]).toBe(3600);
    });
  });
});
