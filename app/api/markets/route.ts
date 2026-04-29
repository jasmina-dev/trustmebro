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
import { marketExchange, normalizeCategory, venueMarketUrl } from "@/lib/utils";
import type { Exchange, UnifiedMarket } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTER_CATEGORIES = ["Politics", "Crypto", "Finance", "Other"];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const exchange = searchParams.get("exchange") as Exchange | null;
  const category = searchParams.get("category") ?? undefined;
  const closed = searchParams.get("closed") === "true";
  const query = searchParams.get("query") ?? undefined;
  const limit = Math.min(500, Number(searchParams.get("limit") ?? 500));

  const key = [
    "markets",
    "v3",
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

      const categories = category ? [category] : ROUTER_CATEGORIES;
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
      return { source: "pmxt" as const, markets };
    });

    // Normalize category on the way out so downstream charts can group
    // without having to know every venue's taxonomy quirks.
    const normalized: UnifiedMarket[] = value.markets.map((m) => ({
      ...m,
      exchange: marketExchange(m),
      category: normalizeCategory(m.category ?? null),
      url: venueMarketUrl(m),
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
