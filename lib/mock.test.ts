/** @jest-environment node */

import { mockMarkets } from "./mock";

/**
 * Unit tests for `lib/mock.ts`.
 *
 * @remarks
 * Mock mode is used when PMXT credentials are not present. These tests lock in
 * the shape/size invariants relied on by the dashboard defaults.
 */
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
