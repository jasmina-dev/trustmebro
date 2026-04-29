/**
 * GET /api/resolution-bias
 *
 * Aggregates closed markets (from `GET /v0/markets?closed=true`) by
 * (category, exchange) and computes NO vs YES resolution rates plus a
 * single-proportion z-score vs an unbiased 50% null.
 *
 * We intentionally do NOT pull from archive.pmxt.dev here — the archive
 * ships Parquet (binary columnar), which can't be parsed inside a Next.js
 * API route without a native dependency. The Router with `closed=true` is
 * fast enough (~10ms per page) and already structured, so we paginate
 * through every page instead.
 *
 * Cache keys:
 *   resolution-bias:<exchange>:<category>  — per cell, 1h TTL
 *   raw:closed:<exchange>:<category>:<offset>  — per PMXT page, 1h TTL
 *                                                (via fetchAllMarkets)
 *
 * Query params (all optional):
 *   - category   filter to a single normalized category
 */

import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { fetchAllMarkets, timed } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import {
  mockMarkets,
  assignResolutionLabels,
  mockResolutionBuckets,
} from "@/lib/mock";
import { normalizeCategory } from "@/lib/utils";
import { computeBiasBucket } from "@/lib/bias";
import type { Exchange } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["Sports", "Politics", "Crypto", "Finance", "Other"];
const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];
const BUCKET_TTL = 3600; // resolved markets don't change

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const categoryFilter = searchParams.get("category");

  const targets: Array<{ exchange: Exchange; category: string }> = [];
  for (const ex of EXCHANGES) {
    for (const cat of CATEGORIES) {
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
              normalizeCategory(m.category) === category,
          ),
        ),
      );
      return NextResponse.json(
        {
          data: buckets,
          cache: "MISS",
          fetchedAt: new Date().toISOString(),
          source: "mock",
        },
        { headers: { "X-Cache": "MISS", "Cache-Control": "no-store" } },
      );
    }

    // Build buckets in parallel — each cell has its own cache entry so a slow
    // page on one venue doesn't block the others.
    const t0 = Date.now();
    let cacheHits = 0;

    const results = await Promise.all(
      targets.map(({ exchange, category }) =>
        timed(`bias:${exchange}:${category}`, async () => {
          const { value, state } = await cached(
            `resolution-bias:${exchange}:${category}`,
            BUCKET_TTL,
            async () => {
              const { markets } = await fetchAllMarkets({
                exchange,
                category,
                closed: true,
              });
              return computeBiasBucket(category, exchange, markets);
            },
          );
          if (state === "HIT") cacheHits += 1;
          return { bucket: value, state };
        }),
      ),
    );

    const allCached = results.every((r) => r.state === "HIT");
    const state: "HIT" | "MISS" = allCached ? "HIT" : "MISS";
    const buckets = results.map((r) => r.bucket);
    const sampleSize = buckets.reduce((s, b) => s + b.total, 0);

    console.log(
      `[/api/resolution-bias] ${targets.length} cells, ${cacheHits} cache hits, n=${sampleSize}, ${Date.now() - t0}ms`,
    );

    return NextResponse.json(
      {
        data: buckets,
        meta: { sampleSize, cells: targets.length },
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: "pmxt",
      },
      { headers: { "X-Cache": state, "Cache-Control": "no-store" } },
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
      { status: 200, headers: { "X-Cache": "BYPASS" } },
    );
  }
}
