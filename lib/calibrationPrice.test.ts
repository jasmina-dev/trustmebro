/** @jest-environment node */

import type { UnifiedMarket } from "./types";
import {
  impliedYesForAnalytics,
  impliedYesForCalibration,
  impliedYesStrictNoTerminal,
} from "./calibrationPrice";

/**
 * Unit tests for `lib/calibrationPrice.ts`.
 *
 * @remarks
 * The calibration pipeline relies on a consistent definition of "implied YES"
 * across venues and market shapes. These tests lock in edge cases such as
 * pinned pre-resolution snapshots and terminal-ish prices.
 */
function market(
  partial: Partial<UnifiedMarket> &
    Pick<UnifiedMarket, "marketId" | "outcomes">,
): UnifiedMarket {
  return {
    title: "t",
    volume: 1,
    volume24h: 1,
    liquidity: 1,
    ...partial,
  };
}

describe("impliedYesForCalibration", () => {
  test("uses preResolutionYesPrice when set", () => {
    const m = market({
      marketId: "1",
      preResolutionYesPrice: 0.62,
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.99 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.01 },
      ],
    });
    expect(impliedYesForCalibration(m)).toBeCloseTo(0.62);
  });

  test("uses settlement YES price when pre-resolution pin absent", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.99 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.01 },
      ],
    });
    expect(impliedYesForCalibration(m)).toBeCloseTo(0.99);
  });

  test("uses mid-range YES price when no pin", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.55 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.45 },
      ],
    });
    expect(impliedYesForCalibration(m)).toBeCloseTo(0.55);
  });
});

describe("impliedYesStrictNoTerminal", () => {
  test("returns null for terminal YES outcome without pre-resolution pin", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.99 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.01 },
      ],
    });
    expect(impliedYesStrictNoTerminal(m)).toBeNull();
  });

  test("returns null when pinned probability is outside (0,1)", () => {
    const m = market({
      marketId: "1",
      preResolutionYesPrice: 1.01,
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.5 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.5 },
      ],
    });
    expect(impliedYesStrictNoTerminal(m)).toBeNull();
  });

  test("returns mid-range YES when pinned absent and price is tradeable", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.42 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.58 },
      ],
    });
    expect(impliedYesStrictNoTerminal(m)).toBeCloseTo(0.42);
  });
});

describe("impliedYesForAnalytics", () => {
  test("returns null when pinned is outside the open unit interval", () => {
    const m = market({
      marketId: "1",
      preResolutionYesPrice: -0.1,
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.5 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.5 },
      ],
    });
    expect(impliedYesForAnalytics(m)).toEqual({ price: null, basis: null });
  });

  test("returns null when YES price is non-finite", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: Number.NaN },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.5 },
      ],
    });
    expect(impliedYesForAnalytics(m)).toEqual({ price: null, basis: null });
  });

  test("tags mid basis for non-terminal YES prices", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.41 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.59 },
      ],
    });
    expect(impliedYesForAnalytics(m)).toEqual({ price: 0.41, basis: "mid" });
  });

  test("tags settlement basis for terminal prices", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.99 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.01 },
      ],
    });
    expect(impliedYesForAnalytics(m)).toEqual({
      price: 0.99,
      basis: "settlement",
    });
  });
});
