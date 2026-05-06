/** @jest-environment node */

import type { UnifiedMarket } from "./types";
import { impliedYesForCalibration } from "./calibrationPrice";

function market(partial: Partial<UnifiedMarket> & Pick<UnifiedMarket, "marketId" | "outcomes">): UnifiedMarket {
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

  test("returns null for terminal YES outcome without pre-resolution pin", () => {
    const m = market({
      marketId: "1",
      outcomes: [
        { outcomeId: "y", marketId: "1", label: "Yes", price: 0.99 },
        { outcomeId: "n", marketId: "1", label: "No", price: 0.01 },
      ],
    });
    expect(impliedYesForCalibration(m)).toBeNull();
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
