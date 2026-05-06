/** @jest-environment node */

import { mockMarkets } from "./mock";

describe("mockMarkets", () => {
  test("live dual-venue universe matches expected 500-row dashboard default", () => {
    expect(mockMarkets({}).length).toBe(500);
  });

  test("closed dual-venue is not truncated by legacy implicit limit=500", () => {
    expect(mockMarkets({ closed: true }).length).toBe(5 * 2 * 120);
  });

  test("respects explicit limit cap when provided", () => {
    expect(mockMarkets({ closed: true, limit: 500 }).length).toBe(500);
  });
});
