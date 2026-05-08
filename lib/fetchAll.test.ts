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
