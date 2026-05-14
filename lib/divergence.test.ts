import { divergentPairsForCategory, pairMarkets } from "./divergence";
import { fetchAllMarkets, timed } from "./fetchAll";
import type { UnifiedMarket } from "./types";

/**
 * Unit tests for `lib/divergence.ts`.
 *
 * @remarks
 * Verifies deterministic market pairing logic (title similarity + price deltas)
 * without depending on network fetches.
 */
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
  beforeEach(() => {
    (timed as jest.Mock).mockImplementation(
      async (_l: string, fn: () => Promise<unknown>) => fn(),
    );
    (fetchAllMarkets as jest.Mock).mockReset();
  });

  test("divergentPairsForCategory stitches both venues via fetchAllMarkets", async () => {
    (fetchAllMarkets as jest.Mock)
      .mockResolvedValueOnce({
        markets: [market("p1", "Will GDP exceed 2.5% in Q3?", 0.72)],
      })
      .mockResolvedValueOnce({
        markets: [market("k1", "Will GDP exceed 2.5% in Q3", 0.55)],
      });

    const pairs = await divergentPairsForCategory("Finance");
    expect(pairs).toHaveLength(1);
    expect(fetchAllMarkets).toHaveBeenCalledTimes(2);
  });

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

  test("pairMarkets returns empty when either venue list is empty", () => {
    expect(pairMarkets([], [market("k", "t", 0.5)], "X")).toEqual([]);
    expect(pairMarkets([market("p", "t", 0.5)], [], "X")).toEqual([]);
  });

  test("pairMarkets chooses buy_poly when Kalshi YES is richer", () => {
    const poly = [market("p1", "Will the Fed cut rates in July 2026?", 0.42)];
    const kalshi = [market("k1", "Will the Fed cut rates in July 2026", 0.68)];
    const pairs = pairMarkets(poly, kalshi, "Finance");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].arbitrageDirection).toBe("buy_poly");
  });

  test("pairMarkets skips when best title match is below similarity threshold", () => {
    const poly = [market("p1", "ZZZ unique poly title xyz", 0.7)];
    const kalshi = [market("k1", "AAA totally different wording", 0.4)];
    expect(pairMarkets(poly, kalshi, "Other")).toEqual([]);
  });
});
