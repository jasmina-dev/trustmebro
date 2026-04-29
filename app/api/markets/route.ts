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
 * Cache key:  markets:<exchange>:<category>:<closed>:<query>:<limit>
 * TTL:        60s (live) / 3600s (closed)
 */

import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { hasPmxtKey, router } from "@/lib/pmxt";
import { mockMarkets, assignResolutionLabels } from "@/lib/mock";
import { normalizeCategory } from "@/lib/utils";
import type { Exchange, UnifiedMarket } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const exchange = searchParams.get("exchange") as Exchange | null;
  const category = searchParams.get("category") ?? undefined;
  const closed = searchParams.get("closed") === "true";
  const query = searchParams.get("query") ?? undefined;
  const limit = Math.min(500, Number(searchParams.get("limit") ?? 500));

  const key = [
    "markets",
    exchange ?? "all",
    category ?? "all",
    closed ? "closed" : "live",
    query ?? "-",
    limit,
  ].join(":");
  const ttl = closed ? 3600 : 60;

  const t0 = Date.now();
  try {
    const { value, state } = await cached(key, ttl, async () => {
      if (!hasPmxtKey()) {
        const mocks = mockMarkets({
          exchange: exchange ?? undefined,
          closed,
          category,
          limit,
        });
        return {
          source: "mock" as const,
          markets: closed ? assignResolutionLabels(mocks) : mocks,
        };
      }

      // Router doesn't require an exchange filter, but when both venues are
      // wanted we want to tag rows with their exchange. Simplest approach:
      // run two calls when `exchange` isn't specified.
      const exchanges: Exchange[] = exchange
        ? [exchange]
        : ["polymarket", "kalshi"];

      const results = await Promise.all(
        exchanges.map((ex) =>
          router.markets({ exchange: ex, category, closed, query, limit }),
        ),
      );
      const markets = results.flatMap((r, i) =>
        r.data.map((m) => ({ ...m, exchange: exchanges[i] })),
      );
      return { source: "pmxt" as const, markets };
    });

    // Normalize category on the way out so downstream charts can group
    // without having to know every venue's taxonomy quirks.
    const normalized: UnifiedMarket[] = value.markets.map((m) => ({
      ...m,
      category: normalizeCategory(m.category ?? null),
    }));

    console.log(
      `[/api/markets] key=${key} rows=${normalized.length} ${state} · ${Date.now() - t0}ms`,
    );
    return NextResponse.json(
      {
        data: normalized,
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: value.source,
      },
      { headers: { "X-Cache": state, "Cache-Control": "no-store" } },
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
      { status: 500, headers: { "X-Cache": "BYPASS" } },
    );
  }
}
