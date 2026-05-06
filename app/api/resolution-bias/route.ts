/**
 * GET /api/resolution-bias
 *
 * Aggregates closed markets by (category, exchange) and computes NO vs YES rates
 * plus a single-proportion z-score vs 50%.
 *
 * We fetch **without** Router `category=` filters and bucket with
 * `resolutionBiasMarketCategory()` locally (category tags plus title fallback).
 * PMXT venues label categories differently from our heatmap columns; relying on
 * Router category strings alone left Kalshi cells (Crypto, Finance, Other) empty
 * even when resolved markets existed.
 *
 * Cache keys:
 *   resolution-bias:v7:<exchange>:aggregated  — buckets per venue (Pol/Crypto/Fin/Sports/Other), 1h TTL
 *   raw:v2:closed:<exchange>:-:-:<offset>     — paginated Router pages (via fetchAllMarkets)
 *
 * Query params (all optional):
 *   - category   filter to a single normalized category (still reads full venue cache).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CC_RESOLUTION_BIAS,
  jsonCacheHeaders,
} from "@/lib/cacheHeaders";
import { timed } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import {
  mockMarkets,
  assignResolutionLabels,
  mockResolutionBuckets,
} from "@/lib/mock";
import { resolutionBiasMarketCategory } from "@/lib/utils";
import { computeBiasBucket } from "@/lib/bias";
import {
  cachedBucketsForExchange,
  RESOLUTION_BIAS_CATEGORIES,
} from "@/lib/resolutionBiasData";
import type { Exchange, ResolutionBiasBucket } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const categoryFilter = searchParams.get("category");

  const targets: Array<{ exchange: Exchange; category: string }> = [];
  for (const ex of EXCHANGES) {
    for (const cat of RESOLUTION_BIAS_CATEGORIES) {
      if (categoryFilter && cat !== categoryFilter) continue;
      targets.push({ exchange: ex, category: cat });
    }
  }

  try {
    if (!hasPmxtKey()) {
      const markets = assignResolutionLabels(mockMarkets({ closed: true }));
      const buckets = targets.map(({ exchange, category }) =>
        computeBiasBucket(
          category,
          exchange,
          markets.filter(
            (m) =>
              m.exchange === exchange &&
              resolutionBiasMarketCategory(m) === category,
          ),
        ),
      );
      return NextResponse.json(
        {
          data: buckets,
          cache: "MISS",
          fetchedAt: new Date().toISOString(),
          source: "mock",
          meta: { aggregation: "local-normalize", cells: buckets.length },
        },
        { headers: jsonCacheHeaders("MISS", CC_RESOLUTION_BIAS) },
      );
    }

    const t0 = Date.now();
    const byExchange = new Map<
      Exchange,
      Awaited<ReturnType<typeof cachedBucketsForExchange>>
    >();

    await Promise.all(
      EXCHANGES.map((ex) =>
        timed(`bias:v7:${ex}`, async () => {
          const out = await cachedBucketsForExchange(ex);
          byExchange.set(ex, out);
        }),
      ),
    );

    const cacheHits = EXCHANGES.filter(
      (ex) => byExchange.get(ex)?.state === "HIT",
    ).length;
    const allCached =
      cacheHits === EXCHANGES.length && EXCHANGES.length > 0;
    const state: "HIT" | "MISS" = allCached ? "HIT" : "MISS";

    const buckets = targets.map(({ exchange, category }) => {
      const hit = byExchange.get(exchange)!;
      const row = hit.buckets.find((b) => b.category === category);
      if (!row) {
        const emptyBucket: ResolutionBiasBucket = computeBiasBucket(
          category,
          exchange,
          [],
        );
        return emptyBucket;
      }
      return row;
    });

    const sampleSize = buckets.reduce((s, b) => s + b.total, 0);

    console.log(
      `[/api/resolution-bias] v7 aggregated, ${targets.length} cells, exchanges cache hits ${cacheHits}/${EXCHANGES.length}, n=${sampleSize}, ${Date.now() - t0}ms`,
    );

    return NextResponse.json(
      {
        data: buckets,
        meta: {
          sampleSize,
          cells: targets.length,
          aggregation: "router-all-closed+resolutionBiasMarketCategory",
          cacheKeys: `${EXCHANGES.length} × venue aggregate`,
          exchangeCacheHits: cacheHits,
        },
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: "pmxt",
      },
      { headers: jsonCacheHeaders(state, CC_RESOLUTION_BIAS) },
    );
  } catch (err) {
    console.error("[/api/resolution-bias] failure", err);
    return NextResponse.json(
      {
        data: mockResolutionBuckets(),
        cache: "BYPASS",
        fetchedAt: new Date().toISOString(),
        source: "mock",
        error: (err as Error).message,
      },
      { status: 200, headers: jsonCacheHeaders("BYPASS", "no-store") },
    );
  }
}
