/**
 * Shared pure utilities for inefficiency math and UI formatting.
 */

import type {
  DistributionBucket,
  UnifiedMarket,
  UnifiedOutcome,
} from "./types";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function usd(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(digits)}`;
}

export function compactInt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / (values.length - 1));
}

/**
 * Z-score of an observed proportion `p` against the null hypothesis that the
 * true rate is `p0` (default 0.5 — unbiased). Uses the standard
 * single-proportion test; safe for small n (returns 0 when n < 1).
 */
export function proportionZ(p: number, n: number, p0 = 0.5): number {
  if (n < 1) return 0;
  const se = Math.sqrt((p0 * (1 - p0)) / n);
  if (se === 0) return 0;
  return (p - p0) / se;
}

export function histogram(
  values: number[],
  { bins = 20, min = 0, max = 1 }: { bins?: number; min?: number; max?: number } = {},
): DistributionBucket[] {
  const buckets: DistributionBucket[] = [];
  const width = (max - min) / bins;
  for (let i = 0; i < bins; i++) {
    const bucketStart = min + i * width;
    const bucketEnd = bucketStart + width;
    buckets.push({
      bucketStart,
      bucketEnd,
      count: 0,
      label: `${Math.round(bucketStart * 100)}–${Math.round(bucketEnd * 100)}%`,
    });
  }
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const idx = clamp(Math.floor((v - min) / width), 0, bins - 1);
    buckets[idx].count += 1;
  }
  return buckets;
}

/**
 * Probability density of the standard normal at x, optionally rescaled to a
 * distribution with mean `mu` and stddev `sigma`. Used to overlay the
 * "expected" curve on resolution-rate histograms.
 */
export function normalPdf(x: number, mu = 0.5, sigma = 0.15): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

// ---------------------------------------------------------------------------
// Market helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort YES outcome extraction. Binary markets typically have labels
 * "Yes"/"No"; some venues use category labels ("Trump"/"Harris") which we
 * treat as the first outcome for divergence comparison.
 */
export function yesOutcome(m: UnifiedMarket): UnifiedOutcome | undefined {
  const exact = m.outcomes.find((o) => /^yes$/i.test(o.label));
  if (exact) return exact;
  // For non-binary markets, just return the first outcome with the highest
  // price — comparing top-line outcomes across venues is a reasonable proxy.
  if (m.outcomes.length === 0) return undefined;
  return [...m.outcomes].sort((a, b) => b.price - a.price)[0];
}

export function noOutcome(m: UnifiedMarket): UnifiedOutcome | undefined {
  return m.outcomes.find((o) => /^no$/i.test(o.label));
}

export function isResolved(m: UnifiedMarket): boolean {
  const s = (m.status ?? "").toLowerCase();
  return s === "resolved" || s === "closed" || s === "settled";
}

/**
 * Returns the "winning" label of a resolved market by looking at the outcome
 * whose final price is closest to 1.
 */
export function resolvedLabel(m: UnifiedMarket): string | null {
  if (!isResolved(m) || m.outcomes.length === 0) return null;
  const winner = [...m.outcomes].sort((a, b) => b.price - a.price)[0];
  if (winner.price < 0.8) return null; // ambiguous / unresolved despite status
  return winner.label;
}

/**
 * Normalize a venue category string into our 5-bucket taxonomy.
 * Venues use different casings ("Sports" / "sports") and subcategories
 * ("NFL", "NBA" → Sports).
 */
export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "Other";
  const s = raw.toLowerCase();
  if (/sport|nfl|nba|mlb|nhl|soccer|ncaa|ufc|tennis|golf|f1/.test(s))
    return "Sports";
  if (/politic|election|senate|house|president|congress/.test(s))
    return "Politics";
  if (/crypto|bitcoin|ethereum|btc|eth|solana/.test(s)) return "Crypto";
  if (/finance|fed|gdp|cpi|unemployment|rate|stock|market/.test(s))
    return "Finance";
  return "Other";
}

/**
 * Lightweight fuzzy match between two market titles.
 * Lowercases, strips punctuation, and returns the Jaccard similarity of
 * their word sets — cheap and good enough for "same question, different venue".
 */
export function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
    );
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "will",
  "win",
  "with",
  "against",
  "over",
  "under",
  "vs",
  "this",
  "that",
]);
