import { pairMarkets } from "./divergence";
import type { UnifiedMarket } from "./types";

jest.mock("./fetchAll", () => ({
  fetchAllMarkets: jest.fn(),
  timed: jest.fn(),
}));

function market(
  marketId: string,
  title: string,
  yesPrice: number,
  noPrice = 1 - yesPrice,
): UnifiedMarket {
  return {
    marketId,
    title,
    volume: 1000,
    volume24h: 100,
    liquidity: 500,
    outcomes: [
      { outcomeId: `${marketId}-y`, marketId, label: "Yes", price: yesPrice },
      { outcomeId: `${marketId}-n`, marketId, label: "No", price: noPrice },
    ],
  };
}

describe("lib/divergence", () => {
  test("pairMarkets returns divergent matches above spread threshold", () => {
    const poly = [market("poly-1", "Will BTC close above 100k in 2026?", 0.7)];
    const kalshi = [market("kal-1", "Will BTC close above 100k in 2026", 0.62)];

    const pairs = pairMarkets(poly, kalshi, "Crypto");

    expect(pairs).toHaveLength(1);
    expect(pairs[0].polyMarketId).toBe("poly-1");
    expect(pairs[0].kalshiMarketId).toBe("kal-1");
    expect(pairs[0].spread).toBeCloseTo(0.08, 6);
    expect(pairs[0].arbitrageDirection).toBe("buy_kalshi");
  });

  test("pairMarkets skips pairs under spread threshold", () => {
    const poly = [market("poly-2", "Will ETH reach 10k by year end?", 0.51)];
    const kalshi = [market("kal-2", "Will ETH reach 10k by year end", 0.5)];

    const pairs = pairMarkets(poly, kalshi, "Crypto");

    expect(pairs).toEqual([]);
  });

  test("pairMarkets does not reuse a kalshi market for multiple poly matches", () => {
    const poly = [
      market("poly-a", "Will BTC close above 100k?", 0.7),
      market("poly-b", "Will BTC close above 100k this year?", 0.68),
    ];
    const kalshi = [market("kal-a", "Will BTC close above 100k", 0.5)];

    const pairs = pairMarkets(poly, kalshi, "Crypto");
    expect(pairs).toHaveLength(1);
  });

  test("pairMarkets skips invalid yes prices at 0 or 1", () => {
    const poly = [market("poly-bad", "Will event happen?", 1)];
    const kalshi = [market("kal-ok", "Will event happen", 0.4)];

    expect(pairMarkets(poly, kalshi, "Politics")).toEqual([]);
  });
});
