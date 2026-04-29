// utilized cursor to generate tests

import {
  loadStoredBuckets,
  saveStoredBuckets,
  loadTrimmedCashflowBuckets,
  mergeBucketSeries,
  trimBucketsToLookback,
  sliceBucketsByWindow,
  densifyHourlyWindow,
  buildMinimalAnalytics,
  applyWindowToAnalytics,
} from "./demoCashflowStore";
import type { TradesTimeBucket, TradesAnalytics } from "../api/client";

describe("demoCashflowStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads and saves buckets through localStorage", () => {
    const nowHour = new Date();
    nowHour.setMinutes(0, 0, 0);
    const nextHour = new Date(nowHour.getTime() + 3_600_000);
    const buckets: TradesTimeBucket[] = [
      {
        bucketStart: nowHour.toISOString(),
        bucketEnd: nextHour.toISOString(),
        volume: 10,
        tradeCount: 1,
      },
    ];
    saveStoredBuckets(buckets);
    const loaded = loadStoredBuckets();
    expect(loaded).toEqual(buckets);
    expect(loadTrimmedCashflowBuckets()).toEqual(buckets);
  });

  it("returns null/empty for invalid localStorage payloads", () => {
    localStorage.setItem("trustmebro:demo:cashflow:v1", "not-json");
    expect(loadStoredBuckets()).toBeNull();
    expect(loadTrimmedCashflowBuckets()).toEqual([]);
  });

  it("merges bucket series by bucketStart with latter series winning", () => {
    const merged = mergeBucketSeries(
      [
        {
          bucketStart: "2026-01-01T00:00:00.000Z",
          bucketEnd: "",
          volume: 1,
          tradeCount: 1,
        },
        {
          bucketStart: "2026-01-01T01:00:00.000Z",
          bucketEnd: "",
          volume: 2,
          tradeCount: 2,
        },
      ],
      [
        {
          bucketStart: "2026-01-01T01:00:00.000Z",
          bucketEnd: "",
          volume: 20,
          tradeCount: 5,
        },
        {
          bucketStart: "2026-01-01T02:00:00.000Z",
          bucketEnd: "",
          volume: 3,
          tradeCount: 3,
        },
      ],
    );
    expect(merged.map((b) => b.volume)).toEqual([1, 20, 3]);
  });

  it("trims and slices buckets by timestamps", () => {
    const nowMs = Date.parse("2026-01-10T12:00:00.000Z");
    const buckets: TradesTimeBucket[] = [
      {
        bucketStart: "2026-01-01T00:00:00.000Z",
        bucketEnd: "",
        volume: 1,
        tradeCount: 1,
      },
      {
        bucketStart: "2026-01-10T10:00:00.000Z",
        bucketEnd: "",
        volume: 2,
        tradeCount: 2,
      },
      { bucketStart: "bad-date", bucketEnd: "", volume: 3, tradeCount: 3 },
    ];
    expect(trimBucketsToLookback(buckets, 24, nowMs)).toEqual([
      {
        bucketStart: "2026-01-10T10:00:00.000Z",
        bucketEnd: "",
        volume: 2,
        tradeCount: 2,
      },
    ]);
    expect(sliceBucketsByWindow(buckets, 3, nowMs)).toEqual([
      {
        bucketStart: "2026-01-10T10:00:00.000Z",
        bucketEnd: "",
        volume: 2,
        tradeCount: 2,
      },
    ]);
  });

  it("densifies hourly windows and aggregates duplicate-hour entries", () => {
    const nowMs = Date.parse("2026-01-01T03:20:00.000Z");
    const dense = densifyHourlyWindow(
      [
        {
          bucketStart: "2026-01-01T02:15:00.000Z",
          bucketEnd: "",
          volume: 10,
          tradeCount: 2,
        },
        {
          bucketStart: "2026-01-01T02:40:00.000Z",
          bucketEnd: "",
          volume: 5,
          tradeCount: 1,
        },
      ],
      4,
      nowMs,
    );
    expect(dense).toHaveLength(4);
    expect(dense[3].bucketStart).toBe("2026-01-01T03:00:00.000Z");
    expect(dense[2].volume).toBe(15);
    expect(dense[2].tradeCount).toBe(3);
  });

  it("builds minimal analytics and applies window recalculation", () => {
    const byTime: TradesTimeBucket[] = [
      {
        bucketStart: "2026-01-01T00:00:00.000Z",
        bucketEnd: "2026-01-01T01:00:00.000Z",
        volume: 10,
        tradeCount: 1,
      },
      {
        bucketStart: "2026-01-01T01:00:00.000Z",
        bucketEnd: "2026-01-01T02:00:00.000Z",
        volume: 20,
        tradeCount: 2,
      },
    ];
    const base = buildMinimalAnalytics(byTime, 2);
    expect(base.totalVolume).toBe(30);
    expect(base.totalTrades).toBe(3);
    expect(base.preDeadlineWindow.windowHours).toBe(2);

    const seed: TradesAnalytics = {
      ...base,
      totalTrades: 999,
      totalVolume: 999,
      timeRange: { earliest: "x", latest: "y" },
    };
    const nowMs = Date.parse("2026-01-01T02:10:00.000Z");
    const applied = applyWindowToAnalytics(seed, byTime, 2, nowMs);
    expect(applied.byTime).toHaveLength(2);
    expect(applied.totalVolume).toBeGreaterThanOrEqual(20);
    expect(applied.timeRange.latest).toBe("2026-01-01T03:00:00.000Z");
  });
});
