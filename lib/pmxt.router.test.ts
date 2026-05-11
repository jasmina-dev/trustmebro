/** @jest-environment node */

/**
 * Integration-style coverage for `router.markets` — exercises `routerFetchMarkets`
 * (auth header, JSON parse, exchange stamping) without a real network.
 */
describe("pmxt router.markets", () => {
  const origFetch = global.fetch;
  const origKey = process.env.PMXT_API_KEY;
  const origRandom = Math.random;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = origFetch;
    jest.useRealTimers();
    Math.random = origRandom;
    if (origKey === undefined) delete process.env.PMXT_API_KEY;
    else process.env.PMXT_API_KEY = origKey;
    jest.resetModules();
  });

  test("returns normalized JSON on first successful fetch", async () => {
    process.env.PMXT_API_KEY = "pmxt_test_router";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            marketId: "m1",
            title: "Test",
            volume: 1,
            volume24h: 1,
            liquidity: 1,
            outcomes: [],
            sourceExchange: "polymarket",
          },
        ],
        meta: { count: 1, limit: 500, offset: 0 },
      }),
    });

    const { router } = await import("./pmxt");
    const out = await router.markets({ limit: 10, offset: 0 });

    expect(out.data).toHaveLength(1);
    expect(out.data[0].exchange).toBe("polymarket");
    expect(global.fetch).toHaveBeenCalled();
    const reqUrl = (global.fetch as jest.Mock).mock.calls[0][0] as URL;
    expect(String(reqUrl)).toContain("/v0/markets");
  });

  test("retries once on 429 then succeeds", async () => {
    process.env.PMXT_API_KEY = "pmxt_test_retry";
    jest.useFakeTimers();
    Math.random = () => 0;

    let n = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      n += 1;
      if (n === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: () => "0" },
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [],
          meta: { count: 0, limit: 500, offset: 0 },
        }),
      });
    });

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { router } = await import("./pmxt");
    const p = router.markets({ limit: 1 });
    await jest.advanceTimersByTimeAsync(5000);
    const out = await p;

    expect(out.data).toEqual([]);
    expect(
      (global.fetch as jest.Mock).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
    warn.mockRestore();
  });

  test("throws a descriptive error when the router responds non-OK", async () => {
    process.env.PMXT_API_KEY = "pmxt_test_err";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      headers: { get: () => null },
      text: async () => '{"upstream":"busy"}',
    });

    const { router } = await import("./pmxt");
    await expect(router.markets({ limit: 1 })).rejects.toThrow(
      /400[\s\S]*busy/,
    );
  });
});
