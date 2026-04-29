/**
 * GET /api/ohlcv
 *
 * Pass-through to `pmxt.<exchange>.fetchOHLCV(outcomeId, { resolution, limit })`
 * with Upstash caching.
 *
 * Query params:
 *   - exchange    "polymarket" | "kalshi"     required
 *   - outcomeId   string                       required (this is the OUTCOME id,
 *                                              not the market id — see
 *                                              https://pmxt.dev/docs/api-reference/fetch-o-h-l-c-v)
 *   - resolution  "1m"|"5m"|"15m"|"1h"|"6h"|"1d"   default "1h"
 *   - limit       int 1-500                     default 168 (= 1 week @ 1h)
 *
 * Cache key: ohlcv:<exchange>:<outcomeId>:<resolution>:<limit>
 * TTL:       300s (5 min)
 */

import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { fetchOhlcv, hasPmxtKey } from "@/lib/pmxt";
import { mockOhlcv } from "@/lib/mock";
import type { Exchange } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const exchange = searchParams.get("exchange") as Exchange | null;
  const outcomeId = searchParams.get("outcomeId");
  const resolution = searchParams.get("resolution") ?? "1h";
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 168)));

  if (!exchange || !outcomeId) {
    return NextResponse.json(
      { error: "Missing required query params: exchange, outcomeId" },
      { status: 400 },
    );
  }

  const key = `ohlcv:${exchange}:${outcomeId}:${resolution}:${limit}`;

  try {
    const { value, state } = await cached(key, 300, async () => {
      if (!hasPmxtKey()) {
        return {
          source: "mock" as const,
          candles: mockOhlcv(outcomeId, { limit }),
        };
      }
      const candles = await fetchOhlcv(exchange, outcomeId, {
        resolution,
        limit,
      });
      return { source: "pmxt" as const, candles };
    });

    return NextResponse.json(
      {
        data: value.candles,
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: value.source,
      },
      { headers: { "X-Cache": state, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/ohlcv] failure", err);
    return NextResponse.json(
      {
        data: mockOhlcv(outcomeId, { limit }),
        cache: "BYPASS",
        fetchedAt: new Date().toISOString(),
        source: "mock",
        error: (err as Error).message,
      },
      { status: 200, headers: { "X-Cache": "BYPASS" } },
    );
  }
}
