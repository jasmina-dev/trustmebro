import type { UnifiedMarket } from "./types";
import {
  clamp,
  histogram,
  marketExchange,
  pct,
  resolvedLabel,
  usd,
  normalizeCategory,
  titleSimilarity,
  venueMarketUrl,
  yesOutcome,
} from "./utils";

function buildMarket(overrides: Partial<UnifiedMarket> = {}): UnifiedMarket {
  return {
    marketId: "MKT-1",
    title: "Will team A win?",
    volume: 1000,
    volume24h: 100,
    liquidity: 500,
    outcomes: [
      { outcomeId: "1", marketId: "MKT-1", label: "Yes", price: 0.62 },
      { outcomeId: "2", marketId: "MKT-1", label: "No", price: 0.38 },
    ],
    ...overrides,
  };
}

describe("lib/utils", () => {
  test("yesOutcome prefers explicit YES labels", () => {
    const market = buildMarket({
      outcomes: [
        { outcomeId: "2", marketId: "MKT-1", label: "No", price: 0.25 },
        { outcomeId: "1", marketId: "MKT-1", label: "Yes", price: 0.75 },
      ],
    });
    expect(yesOutcome(market)?.label).toBe("Yes");
  });

  test("yesOutcome falls back to highest-priced outcome", () => {
    const market = buildMarket({
      outcomes: [
        { outcomeId: "a", marketId: "MKT-1", label: "Team A", price: 0.2 },
        { outcomeId: "b", marketId: "MKT-1", label: "Team B", price: 0.8 },
      ],
    });
    expect(yesOutcome(market)?.label).toBe("Team B");
  });

  test("yesOutcome returns undefined when market has no outcomes", () => {
    const market = buildMarket({ outcomes: [] });
    expect(yesOutcome(market)).toBeUndefined();
  });

  test("histogram bins values and ignores non-finite inputs", () => {
    const buckets = histogram([0.1, 0.15, 0.9, Number.NaN], { bins: 2, min: 0, max: 1 });
    expect(buckets.map((b) => b.count)).toEqual([2, 1]);
  });

  test("histogram clamps out-of-range values to edge buckets", () => {
    const buckets = histogram([-3, 0.2, 2], { bins: 2, min: 0, max: 1 });
    expect(buckets.map((b) => b.count)).toEqual([2, 1]);
  });

  test("normalizeCategory maps venue-specific labels", () => {
    expect(normalizeCategory("NFL Playoffs")).toBe("Sports");
    expect(normalizeCategory("US Senate")).toBe("Politics");
    expect(normalizeCategory("Unknown Vertical")).toBe("Other");
  });

  test("titleSimilarity returns high score for near-identical questions", () => {
    const score = titleSimilarity(
      "Will Bitcoin close above 100k by year-end?",
      "Bitcoin close above 100k by end of year?",
    );
    expect(score).toBeGreaterThan(0.5);
  });

  test("titleSimilarity returns zero for stopword-only titles", () => {
    expect(titleSimilarity("the and will", "this that and")).toBe(0);
  });

  test("venueMarketUrl builds polymarket url from slug", () => {
    const url = venueMarketUrl({
      exchange: "polymarket",
      marketId: "MKT-1",
      slug: "bitcoin-above-100k",
      title: "Will Bitcoin close above 100k?",
    });
    expect(url).toBe("https://polymarket.com/event/bitcoin-above-100k");
  });

  test("venueMarketUrl returns kalshi ticker url when no raw url", () => {
    const url = venueMarketUrl({
      exchange: "kalshi",
      marketId: "FED-25JAN29-B4.75",
      title: "Fed by Jan",
    });
    expect(url).toBe("https://kalshi.com/markets/FED-25JAN29-B4.75");
  });

  test("venueMarketUrl rejects mismatched domain raw url", () => {
    const url = venueMarketUrl({
      exchange: "polymarket",
      marketId: "m1",
      url: "https://kalshi.com/markets/ABC",
      title: "Will X happen?",
    });
    expect(url).toBe("https://polymarket.com/search?search=Will%20X%20happen%3F");
  });

  test("resolvedLabel returns null for unresolved or weak winners", () => {
    expect(resolvedLabel(buildMarket({ status: "active" }))).toBeNull();
    expect(
      resolvedLabel(
        buildMarket({
          status: "resolved",
          outcomes: [
            { outcomeId: "1", marketId: "MKT-1", label: "Yes", price: 0.6 },
            { outcomeId: "2", marketId: "MKT-1", label: "No", price: 0.4 },
          ],
        }),
      ),
    ).toBeNull();
  });

  test("formatters and helpers handle edge values", () => {
    expect(pct(Number.NaN)).toBe("—");
    expect(usd(1_250_000)).toBe("$1.25M");
    expect(clamp(20, 0, 10)).toBe(10);
    expect(marketExchange({ exchange: "kalshi" })).toBe("kalshi");
  });
});
