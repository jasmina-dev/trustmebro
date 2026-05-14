/** @jest-environment node */

describe("redis memory cache", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (origUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = origUrl;
    if (origToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
  });

  test("cached returns MISS then HIT for same key", async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        void (async () => {
          try {
            const { cached, cacheBackendName } =
              require("./redis") as typeof import("./redis");
            expect(cacheBackendName()).toBe("memory");

            const fetcher = jest.fn().mockResolvedValue({ n: 1 });
            const r1 = await cached("mem-key-a", 120, fetcher);
            expect(r1.state).toBe("MISS");
            expect(r1.value).toEqual({ n: 1 });
            expect(fetcher).toHaveBeenCalledTimes(1);

            const r2 = await cached("mem-key-a", 120, fetcher);
            expect(r2.state).toBe("HIT");
            expect(r2.value).toEqual({ n: 1 });
            expect(fetcher).toHaveBeenCalledTimes(1);
            resolve();
          } catch (e) {
            reject(e);
          }
        })();
      });
    });
  });

  test("single-flight: concurrent MISS shares one fetcher", async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        void (async () => {
          try {
            const { cached } = require("./redis") as typeof import("./redis");
            let started = 0;
            const fetcher = jest.fn(async () => {
              started += 1;
              await new Promise((r) => setTimeout(r, 30));
              return { v: started };
            });

            const [a, b] = await Promise.all([
              cached("mem-flight", 60, fetcher),
              cached("mem-flight", 60, fetcher),
            ]);

            expect(fetcher).toHaveBeenCalledTimes(1);
            expect(a.state).toBe("MISS");
            expect(b.state).toBe("MISS");
            expect(a.value).toEqual(b.value);
            resolve();
          } catch (e) {
            reject(e);
          }
        })();
      });
    });
  });

  test("invalidate removes a cached entry", async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        void (async () => {
          try {
            const { cached, invalidate } =
              require("./redis") as typeof import("./redis");
            const fetcher = jest
              .fn()
              .mockResolvedValueOnce(1)
              .mockResolvedValueOnce(2);

            const r1 = await cached("mem-inv", 60, fetcher);
            expect(r1.value).toBe(1);
            await invalidate("mem-inv");
            const r2 = await cached("mem-inv", 60, fetcher);
            expect(r2.value).toBe(2);
            expect(fetcher).toHaveBeenCalledTimes(2);
            resolve();
          } catch (e) {
            reject(e);
          }
        })();
      });
    });
  });

  test("memory cache expires after TTL and refetches", async () => {
    jest.useFakeTimers();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        void (async () => {
          try {
            const { cached } = require("./redis") as typeof import("./redis");
            const fetcher = jest
              .fn()
              .mockResolvedValueOnce("first")
              .mockResolvedValueOnce("second");

            const r1 = await cached("mem-ttl", 1, fetcher);
            expect(r1.state).toBe("MISS");
            expect(r1.value).toBe("first");

            await jest.advanceTimersByTimeAsync(2000);

            const r2 = await cached("mem-ttl", 1, fetcher);
            expect(r2.state).toBe("MISS");
            expect(r2.value).toBe("second");
            expect(fetcher).toHaveBeenCalledTimes(2);
            resolve();
          } catch (e) {
            reject(e);
          }
        })();
      });
    });
    jest.useRealTimers();
  });
});

describe("checkRateLimit in-memory fallback", () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (origUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = origUrl;
    if (origToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
  });

  test("allows requests under the limit", async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        void (async () => {
          try {
            const { checkRateLimit } =
              require("./redis") as typeof import("./redis");
            const id = `rl-ok-${Date.now()}`;
            const a = await checkRateLimit(id, { limit: 3, windowSeconds: 60 });
            const b = await checkRateLimit(id, { limit: 3, windowSeconds: 60 });
            expect(a.success).toBe(true);
            expect(b.success).toBe(true);
            expect(b.remaining).toBeLessThanOrEqual(a.remaining);
            resolve();
          } catch (e) {
            reject(e);
          }
        })();
      });
    });
  });

  test("blocks after limit is exceeded", async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        void (async () => {
          try {
            const { checkRateLimit } =
              require("./redis") as typeof import("./redis");
            const id = `rl-block-${Date.now()}`;
            await checkRateLimit(id, { limit: 1, windowSeconds: 60 });
            const denied = await checkRateLimit(id, {
              limit: 1,
              windowSeconds: 60,
            });
            expect(denied.success).toBe(false);
            expect(denied.remaining).toBe(0);
            resolve();
          } catch (e) {
            reject(e);
          }
        })();
      });
    });
  });
});
