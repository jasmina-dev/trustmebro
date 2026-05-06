/**
 * Resolution bias aggregation — one closed-market crawl per venue, then slice
 * by `resolutionBiasMarketCategory` so taxonomy matches the heatmap even when PMXT Router
 * `category=` filters don't line up with venue-native labels (e.g. Kalshi).
 */

import { cached } from "./redis";
import { fetchAllMarkets } from "./fetchAll";
import { resolutionBiasMarketCategory } from "./utils";
import { computeBiasBucket } from "./bias";
import type { Exchange, ResolutionBiasBucket } from "./types";

/** Must match `/api/resolution-bias` and charts. Bump when aggregation logic changes. */
export const RESOLUTION_BIAS_CACHE_PREFIX = "resolution-bias:v12";

export const RESOLUTION_BIAS_CATEGORIES = [
  "Politics",
  "Crypto",
  "Finance",
  "Sports",
  "Other",
] as const;

/**
 * Cap worst-case cold recomputes (pages × 500 Router rows). Default 20 keeps
 * the cold MISS under the PMXT free-tier 60 req/min budget when the dashboard
 * fans out to several charts at once. Set `RESOLUTION_BIAS_MAX_PAGES` (1–50)
 * in env on long-running hosts (or warmup-cron-fed prod) for fuller history.
 */
const RESOLUTION_BIAS_MAX_PAGES_ENV = Number(
  process.env.RESOLUTION_BIAS_MAX_PAGES,
);
export const RESOLUTION_BIAS_MAX_PAGES = Number.isFinite(
  RESOLUTION_BIAS_MAX_PAGES_ENV,
) && RESOLUTION_BIAS_MAX_PAGES_ENV >= 1
  ? Math.min(50, Math.floor(RESOLUTION_BIAS_MAX_PAGES_ENV))
  : 20;

export const RESOLUTION_BIAS_TTL_SECONDS = 3600;

/**
 * Loads all closed markets for an exchange (no Router category filter),
 * assigns each row to one taxonomy bucket (including Sports), then runs
 * binary-resolution stats. The heatmap UI shows a subset of columns only.
 */
export async function bucketsForExchange(
  exchange: Exchange,
): Promise<{
  buckets: ResolutionBiasBucket[];
  closedMarketsLoaded: number;
}> {
  const { markets } = await fetchAllMarkets({
    exchange,
    closed: true,
    maxPages: RESOLUTION_BIAS_MAX_PAGES,
    ttlSeconds: RESOLUTION_BIAS_TTL_SECONDS,
  });

  const buckets = RESOLUTION_BIAS_CATEGORIES.map((category) => {
    const subset = markets.filter(
      (m) => resolutionBiasMarketCategory(m) === category,
    );
    return computeBiasBucket(category, exchange, subset);
  });

  return { buckets, closedMarketsLoaded: markets.length };
}

export async function cachedBucketsForExchange(
  exchange: Exchange,
): Promise<{
  buckets: ResolutionBiasBucket[];
  closedMarketsLoaded: number;
  state: "HIT" | "MISS";
}> {
  const key = `${RESOLUTION_BIAS_CACHE_PREFIX}:${exchange}:aggregated`;
  const { value, state } = await cached(
    key,
    RESOLUTION_BIAS_TTL_SECONDS,
    async () => bucketsForExchange(exchange),
  );
  const entry = value as {
    buckets: ResolutionBiasBucket[];
    closedMarketsLoaded: number;
  };
  return { ...entry, state };
}
