/**
 * Shared PMXT pagination + timing helpers.
 *
 * `/v0/markets` and `/v0/events` cap at limit=500 per page. To get a complete
 * sample we have to loop with `offset += 500` until `meta.count < limit`.
 *
 * Every call goes through the Upstash cache — resolved markets have a 1h TTL,
 * live markets have 60s. A single market list can span many pages (Sports on
 * Polymarket alone is ~1500 closed markets), so each page is cached on its
 * own key to avoid losing the whole sample when a single page times out.
 */

import { cached } from "./redis";
import { router } from "./pmxt";
import type { Exchange, UnifiedMarket } from "./types";

const PAGE_SIZE = 500;

export interface FetchAllOptions {
  exchange: Exchange;
  category?: string;
  closed?: boolean;
  query?: string;
  /** Hard cap on pages so a broken pagination loop can't melt the quota. */
  maxPages?: number;
  /** Override cache TTL. Defaults: 3600s for closed, 60s for live. */
  ttlSeconds?: number;
}

export interface FetchAllResult {
  markets: UnifiedMarket[];
  pagesFetched: number;
  fromCache: number;
  elapsedMs: number;
}

/**
 * Fetch every market matching the filter, transparently paginating and
 * caching each page. Logs a one-line summary per invocation so the dev
 * console shows what the quota is actually being spent on.
 */
export async function fetchAllMarkets(
  opts: FetchAllOptions,
): Promise<FetchAllResult> {
  const { exchange, category, closed = false, query, maxPages = 20 } = opts;
  const ttl = opts.ttlSeconds ?? (closed ? 3600 : 60);

  const t0 = Date.now();
  const all: UnifiedMarket[] = [];
  let pagesFetched = 0;
  let fromCache = 0;
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const key = [
      "raw",
      closed ? "closed" : "live",
      exchange,
      category ?? "-",
      query ?? "-",
      offset,
    ].join(":");

    const { value: pageData, state } = await cached(key, ttl, async () => {
      const res = await router.markets({
        exchange,
        category,
        closed,
        query,
        limit: PAGE_SIZE,
        offset,
      });
      return res.data.map((m) => ({
        ...m,
        exchange,
        category: m.category ?? category ?? null,
      }));
    });

    pagesFetched += 1;
    if (state === "HIT") fromCache += 1;
    all.push(...pageData);

    if (pageData.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const elapsedMs = Date.now() - t0;
  console.log(
    `[fetchAll] ${exchange}/${category ?? "*"}/${closed ? "closed" : "live"} ` +
      `pages=${pagesFetched} (cache ${fromCache}) rows=${all.length} in ${elapsedMs}ms`,
  );

  return { markets: all, pagesFetched, fromCache, elapsedMs };
}

/**
 * Tiny timing helper — wraps a label around the elapsed-ms log so route
 * handlers can trace bottlenecks without littering files with Date.now()
 * call pairs.
 */
export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    console.log(`[timing] ${label} ${Date.now() - t0}ms`);
    return result;
  } catch (err) {
    console.log(`[timing] ${label} FAILED after ${Date.now() - t0}ms`);
    throw err;
  }
}
