/**
 * GET /api/divergence
 *
 * Finds matched (Polymarket, Kalshi) market pairs whose YES price differs
 * by more than the configured threshold. The Router's `/v0/markets`
 * endpoint returns a flat, venue-specific list — it does NOT auto-match
 * equivalent markets — so we have to do the matching ourselves.
 *
 * Match strategy:
 *   1. Paginate all active markets for each venue (cached per page).
 *   2. For each Polymarket market, find its best Kalshi title via
 *      `stringSimilarity.findBestMatch` (Dice coefficient).
 *   3. Require similarity ≥ 0.5 (bigrams are noisy on short titles) and a
 *      YES-price spread ≥ SPREAD_THRESHOLD.
 *
 * Query params:
 *   - category  optional — restrict to a single normalized category
 *   - limit     max pairs returned (default 100)
 *
 * Cache key: divergence:<category>
 * TTL:       300s (5 min) — spreads move, but not every second.
 */

import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { timed } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets } from "@/lib/mock";
import { normalizeCategory } from "@/lib/utils";
import {
  SIMILARITY_THRESHOLD,
  SPREAD_THRESHOLD,
  divergentPairsForCategory,
  pairMarkets,
} from "@/lib/divergence";
import type { DivergentPair } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["Sports", "Politics", "Crypto", "Finance", "Other"];
const TTL_SECONDS = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const categoryFilter = searchParams.get("category");
  const limit = Math.min(
    500,
    Math.max(1, Number(searchParams.get("limit") ?? 100)),
  );

  try {
    if (!hasPmxtKey()) {
      const all = mockMarkets({});
      const pairs: DivergentPair[] = [];
      for (const cat of CATEGORIES) {
        if (categoryFilter && cat !== categoryFilter) continue;
        const poly = all.filter(
          (m) =>
            m.exchange === "polymarket" &&
            normalizeCategory(m.category) === cat,
        );
        const kalshi = all.filter(
          (m) =>
            m.exchange === "kalshi" && normalizeCategory(m.category) === cat,
        );
        pairs.push(...pairMarkets(poly, kalshi, cat));
      }
      pairs.sort((a, b) => b.spread - a.spread);
      return NextResponse.json(
        {
          data: pairs.slice(0, limit),
          cache: "MISS",
          fetchedAt: new Date().toISOString(),
          source: "mock",
        },
        { headers: { "X-Cache": "MISS", "Cache-Control": "no-store" } },
      );
    }

    // Cache per-category; when the client asks for "all", assemble from the
    // per-category caches so /api/warmup and the unfiltered view share work.
    const categories = categoryFilter ? [categoryFilter] : CATEGORIES;
    const t0 = Date.now();
    let cacheHits = 0;

    const batches = await Promise.all(
      categories.map((cat) =>
        timed(`divergence:${cat}`, async () => {
          const { value, state } = await cached(
            `divergence:${cat}`,
            TTL_SECONDS,
            async () => {
              const pairs = await divergentPairsForCategory(cat);
              return pairs.sort((a, b) => b.spread - a.spread);
            },
          );
          if (state === "HIT") cacheHits += 1;
          return value as DivergentPair[];
        }),
      ),
    );

    const pairs = batches.flat().sort((a, b) => b.spread - a.spread);
    const state: "HIT" | "MISS" =
      cacheHits === categories.length ? "HIT" : "MISS";
    console.log(
      `[/api/divergence] ${pairs.length} pairs above ${SPREAD_THRESHOLD * 100}pp · ` +
        `${cacheHits}/${categories.length} categories cached · ${Date.now() - t0}ms`,
    );

    return NextResponse.json(
      {
        data: pairs.slice(0, limit),
        meta: {
          totalPairs: pairs.length,
          threshold: SPREAD_THRESHOLD,
          similarityThreshold: SIMILARITY_THRESHOLD,
        },
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: "pmxt",
      },
      { headers: { "X-Cache": state, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/divergence] failure", err);
    return NextResponse.json(
      {
        data: [],
        cache: "BYPASS",
        fetchedAt: new Date().toISOString(),
        source: "mock",
        error: (err as Error).message,
      },
      { status: 200, headers: { "X-Cache": "BYPASS" } },
    );
  }
}
