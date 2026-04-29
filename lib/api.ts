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

export async function fetcher<T>(url: string): Promise<ApiPayload<T>> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok && res.status >= 500) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as ApiPayload<T>;
}

/** SWR refresh intervals per data family (seconds). */
export const REFRESH = {
  live: 60_000, // /api/markets
  inefficiencies: 5 * 60_000, // /api/inefficiencies
  resolution: 30 * 60_000, // /api/resolution-bias
  ohlcv: 5 * 60_000,
} as const;
