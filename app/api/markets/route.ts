/**
 * GET /api/markets
 *
 * Pass-through to the PMXT Router (`GET /v0/markets`) for live, active
 * markets. Every response is served from Upstash Redis — we never hit PMXT
 * without a cache check first.
 *
 * Query params (all optional):
 *   - exchange  "polymarket" | "kalshi"    (default: both via separate calls)
 *   - category  normalized category string
 *   - limit     int (default 500, max 500)
 *   - query     full-text search over title/slug
 *   - closed    boolean — include resolved markets
 *
 * Cache key:  markets:v3:<exchange>:<category>:<closed>:<query>:<limit>
 * TTL:        60s (live) / 3600s (closed)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCachedMarketsPayload,
  marketsRedisKey,
  normalizeMarketsForApi,
} from "@/lib/marketsCache";
import type { Exchange } from "@/lib/types";
import {
  CC_MARKETS_CLOSED,
  CC_MARKETS_LIVE,
  jsonCacheHeaders,
} from "@/lib/cacheHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const exchange = searchParams.get("exchange") as Exchange | null;
  const category = searchParams.get("category") ?? undefined;
  const closed = searchParams.get("closed") === "true";
  const query = searchParams.get("query") ?? undefined;
  const limit = Math.min(500, Number(searchParams.get("limit") ?? 500));

  const params = {
    exchange,
    category,
    closed,
    query,
    limit,
  };

  const key = marketsRedisKey(params);
  const t0 = Date.now();

  try {
    const { value, state } = await getCachedMarketsPayload(params);
    const normalized = normalizeMarketsForApi(value.markets);

    console.log(
      `[/api/markets] key=${key} rows=${normalized.length} ${state} · ${Date.now() - t0}ms`,
    );

    const cc = closed ? CC_MARKETS_CLOSED : CC_MARKETS_LIVE;

    return NextResponse.json(
      {
        data: normalized,
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: value.source,
      },
      { headers: jsonCacheHeaders(state, cc) },
    );
  } catch (err) {
    console.error("[/api/markets] failure", err);
    return NextResponse.json(
      {
        data: [],
        cache: "BYPASS",
        fetchedAt: new Date().toISOString(),
        source: "mock",
        error: (err as Error).message,
      },
      { status: 500, headers: jsonCacheHeaders("BYPASS", "no-store") },
    );
  }
}
