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
});

describe("impliedYesForAnalytics", () => {
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
