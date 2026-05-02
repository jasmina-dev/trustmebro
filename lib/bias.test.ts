import { classifyWinnerLabel, computeBiasBucket } from "./bias";
import type { UnifiedMarket } from "./types";

function marketWithOutcomes(
  marketId: string,
  outcomes: UnifiedMarket["outcomes"],
): UnifiedMarket {
  return {
    marketId,
    title: `Market ${marketId}`,
    volume: 100,
    volume24h: 10,
    liquidity: 50,
    outcomes,
  };
}

describe("lib/bias", () => {
  test("classifyWinnerLabel handles yes/no variants", () => {
    expect(classifyWinnerLabel("Yes, before deadline")).toBe("yes");
    expect(classifyWinnerLabel("Not April 30")).toBe("no");
    expect(classifyWinnerLabel("No, after deadline")).toBe("no");
    expect(classifyWinnerLabel("Team A")).toBe("ambiguous");
  });

  test("computeBiasBucket counts resolved yes/no and ambiguous markets", () => {
    const markets: UnifiedMarket[] = [
      marketWithOutcomes("1", [
        { outcomeId: "1y", marketId: "1", label: "Yes", price: 0.9 },
        { outcomeId: "1n", marketId: "1", label: "No", price: 0.1 },
      ]),
      marketWithOutcomes("2", [
        { outcomeId: "2y", marketId: "2", label: "Yes", price: 0.2 },
        { outcomeId: "2n", marketId: "2", label: "No", price: 0.8 },
      ]),
      marketWithOutcomes("3", [
        { outcomeId: "3a", marketId: "3", label: "Team A", price: 0.85 },
        { outcomeId: "3b", marketId: "3", label: "Team B", price: 0.15 },
      ]),
      marketWithOutcomes("4", [
        { outcomeId: "4y", marketId: "4", label: "Yes", price: 0.6 },
        { outcomeId: "4n", marketId: "4", label: "No", price: 0.4 },
      ]),
    ];

    const bucket = computeBiasBucket("Politics", "polymarket", markets);

    expect(bucket.total).toBe(2);
    expect(bucket.yesResolved).toBe(1);
    expect(bucket.noResolved).toBe(1);
    expect(bucket.ambiguous).toBe(2);
    expect(bucket.lowSample).toBe(true);
    expect(bucket.flagged).toBe(false);
  });

  test("computeBiasBucket flags large no-heavy samples", () => {
    const markets: UnifiedMarket[] = Array.from({ length: 35 }, (_, i) =>
      marketWithOutcomes(String(i), [
        { outcomeId: `${i}y`, marketId: String(i), label: "Yes", price: i < 5 ? 0.9 : 0.1 },
        { outcomeId: `${i}n`, marketId: String(i), label: "No", price: i < 5 ? 0.1 : 0.9 },
      ]),
    );

    const bucket = computeBiasBucket("Politics", "polymarket", markets);
    expect(bucket.total).toBe(35);
    expect(bucket.noResolved).toBe(30);
    expect(bucket.yesResolved).toBe(5);
    expect(bucket.flagged).toBe(true);
    expect(bucket.lowSample).toBe(false);
    expect(bucket.noRate).toBeCloseTo(30 / 35, 6);
  });

  test("computeBiasBucket ignores non-binary markets from totals", () => {
    const markets: UnifiedMarket[] = [
      marketWithOutcomes("binary", [
        { outcomeId: "y", marketId: "binary", label: "Yes", price: 0.95 },
        { outcomeId: "n", marketId: "binary", label: "No", price: 0.05 },
      ]),
      {
        ...marketWithOutcomes("multi", []),
        outcomes: [
          { outcomeId: "a", marketId: "multi", label: "A", price: 0.6 },
          { outcomeId: "b", marketId: "multi", label: "B", price: 0.2 },
          { outcomeId: "c", marketId: "multi", label: "C", price: 0.2 },
        ],
      },
    ];

    const bucket = computeBiasBucket("Crypto", "kalshi", markets);
    expect(bucket.total).toBe(1);
    expect(bucket.ambiguous).toBe(1);
  });
});
