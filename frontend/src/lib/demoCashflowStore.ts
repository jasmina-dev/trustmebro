// utilized github copilot

import type { TradesTimeBucket, TradesAnalytics } from "../api/client";

const STORAGE_KEY = "trustmebro:demo:cashflow:v1";

/** How many hours of hourly buckets we keep in localStorage and merge with API data. */
export const CASHFLOW_PERSIST_LOOKBACK_HOURS = 24 * 7;

/** Extra margin beyond UI windows so edge buckets are not dropped. */
const TRIM_MARGIN_HOURS = 48;

function hourFloorMs(ms: number): number {
  return Math.floor(ms / 3_600_000) * 3_600_000;
}

export function loadStoredBuckets(): TradesTimeBucket[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { buckets?: TradesTimeBucket[] };
    if (!Array.isArray(parsed.buckets)) return null;
    return parsed.buckets;
  } catch {
    return null;
  }
}

export function saveStoredBuckets(buckets: TradesTimeBucket[]): void {
  try {
    const trimmed = trimBucketsToLookback(
      buckets,
      CASHFLOW_PERSIST_LOOKBACK_HOURS,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ buckets: trimmed }));
  } catch {
    // ignore quota / private mode
  }
}

/** Load from localStorage and drop buckets older than the persist window. */
export function loadTrimmedCashflowBuckets(): TradesTimeBucket[] {
  const raw = loadStoredBuckets();
  if (!raw?.length) return [];
  return trimBucketsToLookback(raw, CASHFLOW_PERSIST_LOOKBACK_HOURS);
}

export function mergeBucketSeries(
  a: TradesTimeBucket[],
  b: TradesTimeBucket[],
): TradesTimeBucket[] {
  const map = new Map<string, TradesTimeBucket>();
  for (const x of a) {
    if (x?.bucketStart) map.set(x.bucketStart, x);
  }
  for (const x of b) {
    if (x?.bucketStart) map.set(x.bucketStart, x);
  }
  return Array.from(map.values()).sort((p, q) =>
    p.bucketStart.localeCompare(q.bucketStart),
  );
}

export function trimBucketsToLookback(
  buckets: TradesTimeBucket[],
  lookbackHours: number,
  nowMs = Date.now(),
): TradesTimeBucket[] {
  const cutoff = hourFloorMs(nowMs) - (lookbackHours + TRIM_MARGIN_HOURS) * 3_600_000;
  return buckets.filter((b) => {
    const t = Date.parse(b.bucketStart);
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function sliceBucketsByWindow(
  buckets: TradesTimeBucket[],
  windowHours: number,
  nowMs = Date.now(),
): TradesTimeBucket[] {
  const startMs = nowMs - windowHours * 3_600_000;
  return buckets
    .filter((b) => {
      const t = Date.parse(b.bucketStart);
      return Number.isFinite(t) && t >= startMs;
    })
    .sort((p, q) => p.bucketStart.localeCompare(q.bucketStart));
}

/**
 * One hourly bucket per slot in the window (ending at the current UTC hour),
 * so sparse trade data still draws a full timeline. Missing hours use 0.
 */
export function densifyHourlyWindow(
  buckets: TradesTimeBucket[],
  windowHours: number,
  nowMs = Date.now(),
): TradesTimeBucket[] {
  const end = hourFloorMs(nowMs);
  const windowStartMs = end - (windowHours - 1) * 3_600_000;

  const map = new Map<number, { volume: number; tradeCount: number }>();
  for (const b of buckets) {
    const t = Date.parse(b.bucketStart);
    if (!Number.isFinite(t)) continue;
    const floored = hourFloorMs(t);
    if (floored < windowStartMs || floored > end) continue;
    const cur = map.get(floored) ?? { volume: 0, tradeCount: 0 };
    cur.volume += b.volume;
    cur.tradeCount += b.tradeCount;
    map.set(floored, cur);
  }

  const out: TradesTimeBucket[] = [];
  for (let h = 0; h < windowHours; h++) {
    const start = windowStartMs + h * 3_600_000;
    const bucketStart = new Date(start).toISOString();
    const bucketEnd = new Date(start + 3_600_000).toISOString();
    const agg = map.get(start);
    out.push(
      agg
        ? {
            bucketStart,
            bucketEnd,
            volume: agg.volume,
            tradeCount: agg.tradeCount,
          }
        : { bucketStart, bucketEnd, volume: 0, tradeCount: 0 },
    );
  }
  return out;
}

/**
 * At least `hourCount` hourly buckets ending at the current UTC hour, for offline / empty-API demos.
 */
export function generateDemoHourlyBuckets(hourCount: number): TradesTimeBucket[] {
  const end = hourFloorMs(Date.now());
  const out: TradesTimeBucket[] = [];
  for (let i = hourCount - 1; i >= 0; i--) {
    const start = end - i * 3_600_000;
    const bucketStart = new Date(start).toISOString();
    const bucketEnd = new Date(start + 3_600_000).toISOString();
    const wave = 6_000 + 9_000 * (0.5 + 0.5 * Math.sin(i * 0.31));
    const volume = Math.round(wave * (0.88 + 0.24 * Math.sin(i * 1.7)));
    const tradeCount = Math.max(12, Math.round(35 + 45 * (0.5 + 0.5 * Math.cos(i * 0.42))));
    out.push({ bucketStart, bucketEnd, volume, tradeCount });
  }
  return out;
}

export function buildMinimalAnalytics(
  byTime: TradesTimeBucket[],
  windowHours: number,
): TradesAnalytics {
  const totalVolume = byTime.reduce((s, b) => s + b.volume, 0);
  const totalTrades = byTime.reduce((s, b) => s + b.tradeCount, 0);
  const earliest = byTime[0]?.bucketStart ?? "";
  const latest = byTime[byTime.length - 1]?.bucketEnd ?? "";
  return {
    totalTrades,
    totalVolume,
    uniqueTraders: 0,
    uniqueMarkets: 0,
    timeRange: { earliest, latest },
    byTime,
    perMarket: [],
    whaleTraders: [],
    preDeadlineWindow: {
      windowHours,
      windowStart: earliest,
      windowEnd: latest,
      volume: 0,
      tradeCount: 0,
      shareOfTotalVolume: 0,
    },
  };
}

export function applyWindowToAnalytics(
  base: TradesAnalytics,
  fullSeries: TradesTimeBucket[],
  windowHours: number,
  nowMs = Date.now(),
): TradesAnalytics {
  const dense = densifyHourlyWindow(fullSeries, windowHours, nowMs);
  const totalVolume = dense.reduce((s, b) => s + b.volume, 0);
  const totalTrades = dense.reduce((s, b) => s + b.tradeCount, 0);
  return {
    ...base,
    totalTrades,
    totalVolume,
    byTime: dense,
    timeRange: {
      earliest: dense[0]?.bucketStart ?? base.timeRange.earliest,
      latest: dense[dense.length - 1]?.bucketEnd ?? base.timeRange.latest,
    },
  };
}
