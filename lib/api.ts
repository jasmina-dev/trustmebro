/**
 * Client-side API helpers. Wrapper around fetch that parses the standard
 * `{ data, cache, source }` envelope our API routes always return.
 */

export interface ApiPayload<T> {
  data: T;
  cache: "HIT" | "MISS" | "BYPASS";
  fetchedAt: string;
  source: "pmxt" | "archive" | "mock" | "computed";
  error?: string;
  meta?: Record<string, unknown>;
}

/**
 * Default SWR fetcher for this app's API routes.
 *
 * @remarks
 * Routes return a standard `ApiPayload<T>` envelope. We only throw on 5xx to
 * keep 4xx responses (e.g. validation) available to the UI.
 *
 * @param url - Absolute or relative URL.
 */
export async function fetcher<T>(url: string): Promise<ApiPayload<T>> {
  /** Respect Cache-Control from our API routes (private max-age + SWR). */
  const res = await fetch(url);
  if (!res.ok && res.status >= 500) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as ApiPayload<T>;
}

/**
 * Aggressive crawl routes can exceed default browser patience — abort so SWR
 * surfaces an error instead of hanging “loading” forever.
 */
export function createFetcherWithTimeout(timeoutMs: number) {
  return async function fetcherTimed<T>(url: string): Promise<ApiPayload<T>> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok && res.status >= 500) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return (await res.json()) as ApiPayload<T>;
  };
}

/** Matches `/api/resolution-bias` maxDuration headroom. */
export const resolutionBiasFetcher = createFetcherWithTimeout(280_000);

/** SWR refresh intervals per data family (seconds). */
export const REFRESH = {
  live: 60_000, // /api/markets
  inefficiencies: 5 * 60_000, // /api/inefficiencies
  resolution: 30 * 60_000, // /api/resolution-bias
  ohlcv: 5 * 60_000,
} as const;
