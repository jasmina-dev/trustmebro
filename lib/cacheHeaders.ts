/**
 * HTTP cache hints for JSON API routes. Align max-age loosely with Redis TTL.
 * `private` keeps CDN/shared caches out; browsers still reuse responses.
 */

export type ApiCacheState = "HIT" | "MISS" | "BYPASS";

export function jsonCacheHeaders(
  state: ApiCacheState,
  cacheControl: string,
): Record<string, string> {
  return {
    "X-Cache": state,
    "Cache-Control": state === "BYPASS" ? "no-store" : cacheControl,
  };
}

/** Redis TTL ~60s for live market slices */
export const CC_MARKETS_LIVE =
  "private, max-age=45, stale-while-revalidate=120";

/** Redis TTL 3600s for closed slices */
export const CC_MARKETS_CLOSED =
  "private, max-age=900, stale-while-revalidate=2400";

/** divergence:* TTL 600s */
export const CC_DIVERGENCE =
  "private, max-age=300, stale-while-revalidate=600";

/** inefficiencies:v3 TTL 300s */
export const CC_INEFFICIENCIES =
  "private, max-age=180, stale-while-revalidate=420";

/** Venue aggregates TTL 3600s */
export const CC_RESOLUTION_BIAS =
  "private, max-age=900, stale-while-revalidate=2700";

/** calibration:v2 / efficiency-timeline TTL 3600s */
export const CC_HOURLY_AGG =
  "private, max-age=900, stale-while-revalidate=2400";

/** ohlcv:* TTL 300s */
export const CC_OHLCV =
  "private, max-age=180, stale-while-revalidate=420";
