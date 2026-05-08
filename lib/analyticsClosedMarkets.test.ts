jest.mock("./redis", () => ({
  cached: jest.fn(),
}));

jest.mock("./resolutionBiasData", () => ({
  RESOLUTION_BIAS_MAX_PAGES: 7,
  RESOLUTION_BIAS_TTL_SECONDS: 123,
}));

jest.mock("./fetchAll", () => ({
  fetchAllMarkets: jest.fn(),
}));

jest.mock("./utils", () => ({
  resolutionBiasMarketCategory: jest.fn(),
}));

import {
  calibrationRowCategory,
  fetchClosedMarketsForAnalytics,
} from "./analyticsClosedMarkets";
import { fetchAllMarkets } from "./fetchAll";

import { resolutionBiasMarketCategory } from "./utils";

describe("analyticsClosedMarkets", () => {
  test("fetchClosedMarketsForAnalytics uses fetchAllMarkets with resolution-bias params", async () => {
    (fetchAllMarkets as jest.Mock).mockResolvedValue({
      markets: [{ marketId: "m1" }],
      pagesFetched: 1,
      fromCache: 0,
      elapsedMs: 10,
    });

    const res = await fetchClosedMarketsForAnalytics("kalshi");
    expect(res).toEqual([{ marketId: "m1" }]);

    expect(fetchAllMarkets).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: "kalshi",
        closed: true,
        maxPages: 7,
        ttlSeconds: 123,
      }),
    );
  });

  test("calibrationRowCategory maps Sports to Other and preserves core categories", () => {
    (resolutionBiasMarketCategory as jest.Mock).mockReturnValueOnce("Sports");
    expect(calibrationRowCategory({ category: "Sports", title: "x" })).toBe(
      "Other",
    );

    (resolutionBiasMarketCategory as jest.Mock).mockReturnValueOnce("Politics");
    expect(calibrationRowCategory({ category: "Politics", title: "x" })).toBe(
      "Politics",
    );

    (resolutionBiasMarketCategory as jest.Mock).mockReturnValueOnce("Crypto");
    expect(calibrationRowCategory({ category: "Crypto", title: "x" })).toBe(
      "Crypto",
    );

    (resolutionBiasMarketCategory as jest.Mock).mockReturnValueOnce("Finance");
    expect(calibrationRowCategory({ category: "Finance", title: "x" })).toBe(
      "Finance",
    );

    (resolutionBiasMarketCategory as jest.Mock).mockReturnValueOnce("Other");
    expect(calibrationRowCategory({ category: "Other", title: "x" })).toBe(
      "Other",
    );
  });

  test("calibrationRowCategory defaults unknown categories to Other", () => {
    (resolutionBiasMarketCategory as jest.Mock).mockReturnValueOnce("Weird");
    expect(calibrationRowCategory({ category: "Weird", title: "x" })).toBe(
      "Other",
    );
  });
});
