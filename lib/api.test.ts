/** @jest-environment node */

import {
  createFetcherWithTimeout,
  fetcher,
  REFRESH,
  resolutionBiasFetcher,
} from "./api";

describe("fetcher", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("parses JSON envelope on successful response", async () => {
    const payload = {
      data: { x: 1 },
      cache: "HIT" as const,
      fetchedAt: "t0",
      source: "mock" as const,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    await expect(fetcher("/api/test")).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith("/api/test");
  });

  test("throws on 5xx responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    await expect(fetcher("/api/down")).rejects.toThrow("503");
  });

  test("does not throw on 4xx — caller can inspect JSON body", async () => {
    const body = {
      data: null,
      cache: "BYPASS" as const,
      fetchedAt: "t0",
      source: "mock" as const,
      error: "bad request",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => body,
    });

    await expect(fetcher("/api/bad")).resolves.toEqual(body);
  });
});

describe("createFetcherWithTimeout", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("passes AbortSignal.timeout to fetch when available", async () => {
    const timeoutSpy = jest
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue({ aborted: false } as AbortSignal);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        cache: "MISS",
        fetchedAt: "t",
        source: "mock",
      }),
    });

    const timed = createFetcherWithTimeout(12_345);
    await timed("/api/x");

    expect(timeoutSpy).toHaveBeenCalledWith(12_345);
    expect(global.fetch).toHaveBeenCalledWith("/api/x", {
      signal: expect.any(Object),
    });
  });

  test("throws on 5xx for timed fetcher", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    const timed = createFetcherWithTimeout(5000);
    await expect(timed("/api/down")).rejects.toThrow("502");
  });
});

describe("REFRESH and resolutionBiasFetcher", () => {
  test("REFRESH intervals are positive and ordered by use case", () => {
    expect(REFRESH.live).toBe(60_000);
    expect(REFRESH.inefficiencies).toBe(5 * 60_000);
    expect(REFRESH.resolution).toBe(30 * 60_000);
    expect(REFRESH.ohlcv).toBe(5 * 60_000);
  });

  test("resolutionBiasFetcher is a function", () => {
    expect(typeof resolutionBiasFetcher).toBe("function");
  });
});
