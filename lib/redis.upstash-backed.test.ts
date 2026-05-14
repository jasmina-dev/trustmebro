/** @jest-environment node */

/**
 * Exercises `lib/redis.ts` branches that only run when Upstash env vars are
 * present. The real REST client is never constructed — `@upstash/redis` and
 * `@upstash/ratelimit` are fully mocked per test after `jest.resetModules()`.
 */

describe("redis Upstash-backed paths (mocked SDK)", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const origCoordMiss = process.env.UPSTASH_COORDINATE_MISS;
  const origCoordWait = process.env.CACHE_COORD_WAIT_MS;

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
    if (origUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = origUrl;
    if (origToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
    if (origCoordMiss === undefined) delete process.env.UPSTASH_COORDINATE_MISS;
    else process.env.UPSTASH_COORDINATE_MISS = origCoordMiss;
    if (origCoordWait === undefined) delete process.env.CACHE_COORD_WAIT_MS;
    else process.env.CACHE_COORD_WAIT_MS = origCoordWait;
  });

  test("cached returns HIT when Upstash get returns a stored value", async () => {
    jest.resetModules();
    const get = jest.fn().mockResolvedValue({ n: 42 });
    const set = jest.fn();
    const del = jest.fn();
    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({ get, set, del })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const { cached, cacheBackendName } = await import("./redis");
    expect(cacheBackendName()).toBe("upstash");

    const fetcher = jest.fn().mockResolvedValue({ n: 99 });
    const r = await cached("hit-key", 60, fetcher);

    expect(r.state).toBe("HIT");
    expect(r.value).toEqual({ n: 42 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("cached read failure still completes MISS and stores via Upstash", async () => {
    jest.resetModules();
    const get = jest.fn().mockRejectedValueOnce(new Error("read fail"));
    const set = jest
      .fn()
      .mockImplementation(
        async (key: string, _v: unknown, opts?: { nx?: boolean }) => {
          if (opts?.nx) return "OK";
          return undefined;
        },
      );
    const del = jest.fn().mockResolvedValue(1);

    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({ get, set, del })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.UPSTASH_COORDINATE_MISS = "false";

    const { cached } = await import("./redis");
    const fetcher = jest.fn().mockResolvedValue({ ok: 1 });
    const r = await cached("read-fail-key", 60, fetcher);

    expect(r.state).toBe("MISS");
    expect(r.value).toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("cached skips coordination when UPSTASH_COORDINATE_MISS is false", async () => {
    jest.resetModules();
    const get = jest.fn().mockResolvedValue(null);
    const set = jest.fn().mockResolvedValue(undefined);
    const del = jest.fn();

    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({ get, set, del })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.UPSTASH_COORDINATE_MISS = "false";

    const { cached } = await import("./redis");
    await cached("no-coord", 60, jest.fn().mockResolvedValue(7));

    const nxSets = set.mock.calls.filter(
      ([, , o]) => o && (o as { nx?: boolean }).nx,
    );
    expect(nxSets).toHaveLength(0);
  });

  test("cached coordination waits for a peer fill then returns HIT", async () => {
    jest.useFakeTimers();
    jest.resetModules();

    let cacheGets = 0;
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key === "coord-wait-key") {
        cacheGets += 1;
        if (cacheGets >= 3) return { peer: true };
        return null;
      }
      return null;
    });
    const set = jest
      .fn()
      .mockImplementation(async (_k, _v, opts?: { nx?: boolean }) => {
        if (opts?.nx) return null;
        return undefined;
      });
    const del = jest.fn().mockResolvedValue(1);

    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({ get, set, del })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.CACHE_COORD_WAIT_MS = "5000";

    const { cached } = await import("./redis");
    const fetcher = jest.fn().mockResolvedValue({ self: true });

    const p = cached("coord-wait-key", 60, fetcher);
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(250);
    const r = await p;

    expect(r.state).toBe("HIT");
    expect(r.value).toEqual({ peer: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("cached logs and proceeds when lock retry still fails after wait", async () => {
    jest.useFakeTimers();
    jest.resetModules();

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const get = jest.fn().mockResolvedValue(null);
    let nxCalls = 0;
    const set = jest
      .fn()
      .mockImplementation(async (_k, _v, opts?: { nx?: boolean }) => {
        if (opts?.nx) {
          nxCalls += 1;
          return null;
        }
        return undefined;
      });
    const del = jest.fn().mockResolvedValue(1);

    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({ get, set, del })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.CACHE_COORD_WAIT_MS = "5000";

    const { cached } = await import("./redis");
    const fetcher = jest.fn().mockResolvedValue({ solo: 1 });

    const p = cached("coord-timeout-key", 60, fetcher);
    await jest.advanceTimersByTimeAsync(6000);
    const r = await p;

    expect(r.state).toBe("MISS");
    expect(r.value).toEqual({ solo: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("timed out waiting")),
    ).toBe(true);

    warn.mockRestore();
  });

  test("cached ignores write errors after a successful fetch", async () => {
    jest.resetModules();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const get = jest.fn().mockResolvedValue(null);
    const set = jest
      .fn()
      .mockImplementationOnce(async (_k, _v, opts?: { nx?: boolean }) => {
        if (opts?.nx) return "OK";
        throw new Error("write blocked");
      })
      .mockResolvedValue(undefined);
    const del = jest.fn().mockResolvedValue(1);

    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({ get, set, del })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    process.env.UPSTASH_COORDINATE_MISS = "false";

    const { cached } = await import("./redis");
    const r = await cached(
      "write-fail-key",
      60,
      jest.fn().mockResolvedValue({ ok: 2 }),
    );

    expect(r.state).toBe("MISS");
    expect(r.value).toEqual({ ok: 2 });
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("write failed")),
    ).toBe(true);

    warn.mockRestore();
  });

  test("checkRateLimit uses Upstash when limit succeeds", async () => {
    jest.resetModules();

    const slidingWindow = jest.fn(() => ({ kind: "sliding" }));
    const Ratelimit = jest.fn().mockImplementation(() => ({
      limit: jest
        .fn()
        .mockResolvedValue({
          success: true,
          remaining: 4,
          reset: Date.now() + 60_000,
        }),
    }));
    (
      Ratelimit as unknown as { slidingWindow: typeof slidingWindow }
    ).slidingWindow = slidingWindow;

    jest.doMock("@upstash/ratelimit", () => ({ Ratelimit }));
    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const { checkRateLimit } = await import("./redis");
    const r = await checkRateLimit(`rl-up-${Date.now()}`, {
      limit: 10,
      windowSeconds: 60,
    });

    expect(r.success).toBe(true);
    expect(Ratelimit).toHaveBeenCalled();
  });

  test("checkRateLimit falls back to in-memory when Upstash limiter fails", async () => {
    jest.resetModules();

    const slidingWindow = jest.fn(() => ({ kind: "sliding" }));
    const Ratelimit = jest.fn().mockImplementation(() => ({
      limit: jest.fn().mockRejectedValue(new Error("limiter unavailable")),
    }));
    (
      Ratelimit as unknown as { slidingWindow: typeof slidingWindow }
    ).slidingWindow = slidingWindow;

    jest.doMock("@upstash/ratelimit", () => ({ Ratelimit }));
    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      })),
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { checkRateLimit } = await import("./redis");
    const id = `rl-fb-${Date.now()}`;
    const a = await checkRateLimit(id, { limit: 2, windowSeconds: 60 });
    const b = await checkRateLimit(id, { limit: 2, windowSeconds: 60 });
    const c = await checkRateLimit(id, { limit: 2, windowSeconds: 60 });

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(c.success).toBe(false);
    expect(
      warn.mock.calls.some((args) =>
        String(args[0]).includes("Upstash limiter failed"),
      ),
    ).toBe(true);

    warn.mockRestore();
  });
});
