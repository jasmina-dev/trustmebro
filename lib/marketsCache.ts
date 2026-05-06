/**
 * Redis-backed aggregates for GET /api/markets (`markets:v3:*` keys).
 *
 * Warmup previously called `fetchAllMarkets` only, which fills `raw:v2:*`
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

export function marketsTtlSeconds(closed: boolean): number {
  return closed ? 3600 : 60;
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

export function normalizeMarketsForApi(markets: UnifiedMarket[]): UnifiedMarket[] {
  return markets.map((m) => ({
    ...m,
    exchange: marketExchange(m),
    category: normalizeCategory(m.category ?? null),
    url: venueMarketUrl(m),
  }));
}

export async function getCachedMarketsPayload(
  p: MarketsRouteParams,
): Promise<{ value: CachedMarketsValue; state: CacheState }> {
  const key = marketsRedisKey(p);
  const ttl = marketsTtlSeconds(p.closed);
  return cached(key, ttl, () => computeMarketsPayload(p));
}

/** Primes keys used by KPI + charts + PriceVsResolution closed pool. */
export async function primeMarketsV3Aggregates(): Promise<void> {
  const variants: MarketsRouteParams[] = [
    { exchange: null, closed: false, limit: 500 },
    { exchange: "polymarket", closed: false, limit: 500 },
    { exchange: "kalshi", closed: false, limit: 500 },
    { exchange: null, closed: true, limit: 500 },
  ];
  await Promise.all(variants.map((v) => getCachedMarketsPayload(v)));
}
