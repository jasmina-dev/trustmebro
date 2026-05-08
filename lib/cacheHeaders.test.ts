import {
  CC_DIVERGENCE,
  CC_HOURLY_AGG,
  CC_INEFFICIENCIES,
  CC_MARKETS_CLOSED,
  CC_MARKETS_LIVE,
  CC_OHLCV,
  CC_RESOLUTION_BIAS,
  jsonCacheHeaders,
} from "./cacheHeaders";

describe("cacheHeaders", () => {
  test("jsonCacheHeaders sets X-Cache and cache-control for HIT/MISS", () => {
    expect(jsonCacheHeaders("HIT", "private, max-age=10")).toEqual({
      "X-Cache": "HIT",
      "Cache-Control": "private, max-age=10",
    });
    expect(jsonCacheHeaders("MISS", "private, max-age=10")).toEqual({
      "X-Cache": "MISS",
      "Cache-Control": "private, max-age=10",
    });
  });

  test("jsonCacheHeaders forces no-store when BYPASS", () => {
    expect(jsonCacheHeaders("BYPASS", "private, max-age=10")).toEqual({
      "X-Cache": "BYPASS",
      "Cache-Control": "no-store",
    });
  });

  test("exports cache-control strings for major routes", () => {
    // High-signal sanity checks (avoid locking exact values too hard).
    for (const cc of [
      CC_MARKETS_LIVE,
      CC_MARKETS_CLOSED,
      CC_DIVERGENCE,
      CC_INEFFICIENCIES,
      CC_RESOLUTION_BIAS,
      CC_HOURLY_AGG,
      CC_OHLCV,
    ]) {
      expect(cc).toContain("private");
      expect(cc).toContain("max-age=");
    }
  });
});
