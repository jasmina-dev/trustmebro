/**
 * Redis-backed aggregates for GET /api/markets (`markets:v3:*` keys).
 *
 * Warmup previously called `fetchAllMarkets` only, which fills `raw:v5:*`
 * pages — those keys are unrelated to `markets:v3`, so every dashboard hit
 * showed MISS until the route populated Redis. This module is shared by the
 * route handler and warmup/boot primers.
 */

import type { CacheState } from "@/lib/redis";
import { cached } from "@/lib/redis";
import { hasPmxtKey, router } from "@/lib/pmxt";
import { mockMarkets, assignResolutionLabels } from "@/lib/mock";
import { marketExchange, normalizeCategory, venueMarketUrl } from "@/lib/utils";
import type { Exchange, UnifiedMarket } from "@/lib/types";

export const ROUTER_MARKET_CATEGORIES = [
  "Politics",
  "Crypto",
  "Finance",
  "Other",
];

export type MarketsRouteParams = {
  exchange: Exchange | null;
  category?: string;
  closed: boolean;
  query?: string;
  limit: number;
};

/**
 * Build the Redis cache key for a `GET /api/markets` aggregate.
 *
 * @remarks
 * This key is intentionally stable across deploys so `primeMarketsV3Aggregates()`
 * can warm the exact keys the route handler will read.
 *
 * @param p - Normalized route params.
 * @returns Redis key in the `markets:v3:*` namespace.
 */
export function marketsRedisKey(p: MarketsRouteParams): string {
  const exchangeSeg = p.exchange ?? "all";
  const categorySeg = p.category ?? "all";
  const closedSeg = p.closed ? "closed" : "live";
  const querySeg = p.query ?? "-";
  return [
    "markets",
    "v3",
    exchangeSeg,
    categorySeg,
    closedSeg,
    querySeg,
    p.limit,
  ].join(":");
}

/**
 * Compute the cache TTL (in seconds) for `/api/markets` aggregates.
 *
 * @remarks
 * Env overrides are clamped to safe bounds to prevent accidental "forever cache"
 * or extremely chatty revalidation.
 *
 * - Live: defaults to 120s, clamped to \([30, 3600]\).
 * - Closed: defaults to 3600s, clamped to \([60, 86400]\).
 *
 * @param closed - Whether the aggregate is for closed/resolved markets.
 */
export function marketsTtlSeconds(closed: boolean): number {
  if (closed) {
    const raw = process.env.MARKETS_CLOSED_TTL_SECONDS?.trim();
    if (!raw) return 3600;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 60 ? Math.min(n, 86_400) : 3600;
  }
  const raw = process.env.MARKETS_LIVE_TTL_SECONDS?.trim();
  if (!raw) return 120;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 30 ? Math.min(n, 3600) : 120;
}

type CachedMarketsValue = {
  source: "mock" | "pmxt";
  markets: UnifiedMarket[];
};

async function computeMarketsPayload(
  p: MarketsRouteParams,
): Promise<CachedMarketsValue> {
  const { exchange, category, closed, query, limit } = p;

  if (!hasPmxtKey()) {
    const mocks = mockMarkets({
      exchange: exchange ?? undefined,
      closed,
      category,
      limit,
    });
    return {
      source: "mock",
      markets: closed ? assignResolutionLabels(mocks) : mocks,
    };
  }

  const categories = category ? [category] : ROUTER_MARKET_CATEGORIES;
  const results = await Promise.all(
    categories.map((cat) =>
      router.markets({ category: cat, closed, query, limit }),
    ),
  );
  const markets = results
    .flatMap((r) => r.data)
    .filter((m) => {
      const source = marketExchange(m);
      return source && (!exchange || source === exchange);
    })
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, limit);

  return { source: "pmxt", markets };
}

export function normalizeMarketsForApi(
  markets: UnifiedMarket[],
): UnifiedMarket[] {
  return markets.map((m) => ({
    ...m,
    exchange: marketExchange(m),
    category: normalizeCategory(m.category ?? null),
    url: venueMarketUrl(m),
  }));
}

/**
 * Fetch (and cache) the normalized `/api/markets` payload for the given params.
 *
 * @param p - Route params.
 * @returns The cached value plus whether it was a cache HIT/MISS/BYPASS.
 */
export async function getCachedMarketsPayload(
  p: MarketsRouteParams,
): Promise<{ value: CachedMarketsValue; state: CacheState }> {
  const key = marketsRedisKey(p);
  const ttl = marketsTtlSeconds(p.closed);
  return cached(key, ttl, () => computeMarketsPayload(p));
}

/**
 * Prime the most common `markets:v3:*` variants used by the dashboard.
 *
 * @remarks
 * Intended to be called by warmup endpoints / boot primers so the first
 * dashboard pageview doesn't pay the full cold-cache cost.
 */
export async function primeMarketsV3Aggregates(): Promise<void> {
  const variants: MarketsRouteParams[] = [
    { exchange: null, closed: false, limit: 500 },
    { exchange: "polymarket", closed: false, limit: 500 },
    { exchange: "kalshi", closed: false, limit: 500 },
    { exchange: null, closed: true, limit: 500 },
  ];
  await Promise.all(variants.map((v) => getCachedMarketsPayload(v)));
}
