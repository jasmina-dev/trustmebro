/** @jest-environment node */

import type { UnifiedMarket } from "./types";

jest.mock("./fetchAll", () => ({
  fetchAllMarkets: jest.fn(),
}));

jest.mock("./redis", () => ({
  cached: jest.fn(
    async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => {
      const value = await fetcher();
      return { value, state: "MISS" as const };
    },
  ),
}));

import { fetchAllMarkets } from "./fetchAll";
import { cached } from "./redis";
import {
  bucketsForExchange,
  cachedBucketsForExchange,
  RESOLUTION_BIAS_CACHE_PREFIX,
  RESOLUTION_BIAS_CATEGORIES,
} from "./resolutionBiasData";

function binaryMarket(
  id: string,
  category: string,
  yesWins: boolean,
): UnifiedMarket {
  return {
    marketId: id,
    title: "Title",
    category,
    volume: 1,
    volume24h: 1,
    liquidity: 1,
    exchange: "polymarket",
    outcomes: [
      {
        outcomeId: `${id}-y`,
        marketId: id,
        label: "Yes",
        price: yesWins ? 0.99 : 0.01,
      },
      {
        outcomeId: `${id}-n`,
        marketId: id,
        label: "No",
        price: yesWins ? 0.01 : 0.99,
      },
    ],
  };
}

describe("resolutionBiasData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("RESOLUTION_BIAS_CATEGORIES lists five taxonomy buckets", () => {
    expect(RESOLUTION_BIAS_CATEGORIES).toEqual([
      "Politics",
      "Crypto",
      "Finance",
      "Sports",
      "Other",
    ]);
  });

  test("bucketsForExchange builds one bucket per category from closed markets", async () => {
    (fetchAllMarkets as jest.Mock).mockResolvedValue({
      markets: [
        binaryMarket("a", "Politics", true),
        binaryMarket("b", "Politics", false),
        binaryMarket("c", "Crypto", true),
      ],
    });

    const { buckets, closedMarketsLoaded } =
      await bucketsForExchange("polymarket");

    expect(closedMarketsLoaded).toBe(3);
    expect(buckets).toHaveLength(5);
    const politics = buckets.find((b) => b.category === "Politics");
    expect(politics?.total).toBe(2);
    const crypto = buckets.find((b) => b.category === "Crypto");
    expect(crypto?.total).toBe(1);
    expect(fetchAllMarkets).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: "polymarket",
        closed: true,
      }),
    );
  });

  test("cachedBucketsForExchange delegates to cached with stable key prefix", async () => {
    (fetchAllMarkets as jest.Mock).mockResolvedValue({ markets: [] });

    const out = await cachedBucketsForExchange("kalshi");

    expect(out.state).toBe("MISS");
    expect(cached).toHaveBeenCalledWith(
      `${RESOLUTION_BIAS_CACHE_PREFIX}:kalshi:aggregated`,
      expect.any(Number),
      expect.any(Function),
    );
    expect(out.buckets).toHaveLength(5);
  });
});

describe("RESOLUTION_BIAS_MAX_PAGES env", () => {
  const prev = process.env.RESOLUTION_BIAS_MAX_PAGES;

  afterEach(() => {
    if (prev === undefined) delete process.env.RESOLUTION_BIAS_MAX_PAGES;
    else process.env.RESOLUTION_BIAS_MAX_PAGES = prev;
  });

  test("defaults to 20 when env unset", () => {
    jest.isolateModules(() => {
      delete process.env.RESOLUTION_BIAS_MAX_PAGES;
      const { RESOLUTION_BIAS_MAX_PAGES } =
        require("./resolutionBiasData") as typeof import("./resolutionBiasData");
      expect(RESOLUTION_BIAS_MAX_PAGES).toBe(20);
    });
  });

  test("clamps configured pages between 1 and 50", () => {
    jest.isolateModules(() => {
      process.env.RESOLUTION_BIAS_MAX_PAGES = "7";
      const { RESOLUTION_BIAS_MAX_PAGES } =
        require("./resolutionBiasData") as typeof import("./resolutionBiasData");
      expect(RESOLUTION_BIAS_MAX_PAGES).toBe(7);
    });
    jest.isolateModules(() => {
      process.env.RESOLUTION_BIAS_MAX_PAGES = "999";
      const { RESOLUTION_BIAS_MAX_PAGES } =
        require("./resolutionBiasData") as typeof import("./resolutionBiasData");
      expect(RESOLUTION_BIAS_MAX_PAGES).toBe(50);
    });
    jest.isolateModules(() => {
      process.env.RESOLUTION_BIAS_MAX_PAGES = "0";
      const { RESOLUTION_BIAS_MAX_PAGES } =
        require("./resolutionBiasData") as typeof import("./resolutionBiasData");
      expect(RESOLUTION_BIAS_MAX_PAGES).toBe(20);
    });
  });
});
