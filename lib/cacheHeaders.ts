/**
 * HTTP cache hints for JSON API routes. Align max-age loosely with Redis TTL.
 * `private` keeps CDN/shared caches out; browsers still reuse responses.
 */

export type ApiCacheState = "HIT" | "MISS" | "BYPASS";

/**
 * Build response headers describing cache state for JSON API routes.
 *
 * @remarks
 * All API routes return an envelope and also send `X-Cache` to simplify
 * debugging (and to make CDN/browser caching behavior observable).
 *
 * When `state` is `"BYPASS"`, we force `Cache-Control: no-store` even if the
 * route passed a cacheable directive.
 *
 * @param state - Cache state (HIT/MISS/BYPASS).
 * @param cacheControl - Cache-Control value to use for HIT/MISS responses.
 */
export function jsonCacheHeaders(
  state: ApiCacheState,
  cacheControl: string,
): Record<string, string> {
  return {
    "X-Cache": state,
    "Cache-Control": state === "BYPASS" ? "no-store" : cacheControl,
  };
}

/** Cache-Control for `/api/markets` live aggregates. */
export const CC_MARKETS_LIVE =
  "private, max-age=90, stale-while-revalidate=240";

/** Cache-Control for `/api/markets?closed=true` aggregates. */
export const CC_MARKETS_CLOSED =
  "private, max-age=900, stale-while-revalidate=2400";

/** Cache-Control for `/api/divergence` results. */
export const CC_DIVERGENCE = "private, max-age=300, stale-while-revalidate=600";

/** Cache-Control for `/api/inefficiencies` results. */
export const CC_INEFFICIENCIES =
  "private, max-age=180, stale-while-revalidate=420";

/** Cache-Control for `/api/resolution-bias` aggregates. */
export const CC_RESOLUTION_BIAS =
  "private, max-age=900, stale-while-revalidate=2700";

/** Cache-Control for hourly aggregates (calibration + efficiency timeline). */
export const CC_HOURLY_AGG =
  "private, max-age=900, stale-while-revalidate=2400";

/** Cache-Control for `/api/ohlcv` slices. */
export const CC_OHLCV = "private, max-age=180, stale-while-revalidate=420";
