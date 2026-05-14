/** @jest-environment node */

import {
  assignResolutionLabels,
  mockMarkets,
  mockOhlcv,
  mockResolutionBuckets,
} from "./mock";

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

  test("can narrow to a single exchange and category", () => {
    const rows = mockMarkets({
      exchange: "polymarket",
      category: "Politics",
      closed: true,
    });
    expect(rows.length).toBe(120);
    expect(rows.every((m) => m.exchange === "polymarket")).toBe(true);
    expect(rows.every((m) => m.category === "Politics")).toBe(true);
  });
});

describe("mockOhlcv", () => {
  test("returns deterministic series sized to limit", () => {
    const a = mockOhlcv("outcome-xyz", { limit: 12 });
    const b = mockOhlcv("outcome-xyz", { limit: 12 });
    expect(a).toHaveLength(12);
    expect(b.map((c) => c.close)).toEqual(a.map((c) => c.close));
  });
});

describe("mockResolutionBuckets", () => {
  test("emits two rows per dashboard category (both venues)", () => {
    const buckets = mockResolutionBuckets();
    expect(buckets.length).toBe(10);
    expect(buckets[0]).toMatchObject({
      category: expect.any(String),
      exchange: expect.stringMatching(/polymarket|kalshi/),
      total: 120,
    });
  });
});

describe("assignResolutionLabels", () => {
  test("leaves non-resolved markets unchanged", () => {
    const live = mockMarkets({ limit: 1 })[0];
    const out = assignResolutionLabels([live]);
    expect(out[0].outcomes).toEqual(live.outcomes);
  });

  test("pins YES/NO prices for resolved markets", () => {
    const closed = mockMarkets({ closed: true, limit: 1 })[0];
    const relabeled = assignResolutionLabels([
      { ...closed, status: "resolved" },
    ]);
    const yes = relabeled[0].outcomes.find((o) => /^yes$/i.test(o.label));
    const no = relabeled[0].outcomes.find((o) => /^no$/i.test(o.label));
    expect(yes && no).toBeTruthy();
    expect(Math.max(yes!.price, no!.price)).toBeGreaterThanOrEqual(0.9);
    expect(Math.min(yes!.price, no!.price)).toBeLessThanOrEqual(0.11);
  });
});
