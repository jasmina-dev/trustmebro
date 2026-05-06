/**
 * GET /api/warmup
 *
 * Prewarms every cache key the dashboard needs on first paint:
 *   • markets:v3:*        same Redis keys as GET /api/markets (live + closed)
 *   • raw:v5:*            paginated slices via fetchAllMarkets (divergence/bias)
 *   • resolution-bias v12  two venue aggregates
 *   • divergence:*        per-category pair caches (TTL matches route)
 *
 * Intended to be hit by a Vercel cron every 5 min (see vercel.json). Vercel
 * sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set in the
 * project. Manual calls must use the same header. In local dev, omit CRON_SECRET
 * to allow unauthenticated warmup.
 *
 * Response: { warmed: true, ms, routes: [...] } so you can spot-check timing.
 */

import { NextResponse } from "next/server";
import { requireCronAuthorized } from "@/lib/internalApiAuth";
import { cached } from "@/lib/redis";
import { fetchAllMarkets } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import { divergentPairsForCategory } from "@/lib/divergence";
import { cachedBucketsForExchange } from "@/lib/resolutionBiasData";
import { primeMarketsV3Aggregates } from "@/lib/marketsCache";
import type { Exchange } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CATEGORIES = ["Politics", "Crypto", "Finance", "Other"];
const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];

export async function GET(request: Request) {
  const started = Date.now();

  const auth = requireCronAuthorized(request);
  if (auth) return auth;

  if (!hasPmxtKey()) {
    return NextResponse.json({
      warmed: false,
      reason: "PMXT_API_KEY missing — mock mode has no cache to warm",
      ms: Date.now() - started,
    });
  }

  const timings: Array<{ route: string; ms: number }> = [];

  async function track<T>(route: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      timings.push({ route, ms: Date.now() - t0 });
      return result;
    } catch (err) {
      timings.push({ route: `${route} FAILED`, ms: Date.now() - t0 });
      console.warn(`[warmup] ${route} failed`, err);
      return undefined as T;
    }
  }

  // 1a. markets:v3 aggregates (exact keys the HTTP route serves — was missing before)
  const marketsV3 = track("markets:v3", () => primeMarketsV3Aggregates());

  // 1b. Paginated raw slices — divergence + resolution bias reuse these pages
  const liveMarkets = EXCHANGES.map((ex) =>
    track(`raw:${ex}:live`, () => fetchAllMarkets({ exchange: ex })),
  );

  const biasVenues = EXCHANGES.map((ex) =>
    track(`bias:v12:${ex}`, () => cachedBucketsForExchange(ex)),
  );

  // 3. Divergence per category (sequential — avoids PMXT 429 when stacked with
  // live + bias). Shares `raw:*:live` page cache with (1b).
  await Promise.all([marketsV3, ...liveMarkets, ...biasVenues]);

  for (const cat of CATEGORIES) {
    await track(`divergence:${cat}`, async () => {
      const { value } = await cached(`divergence:${cat}`, 600, async () => {
        const pairs = await divergentPairsForCategory(cat);
        return pairs.sort((a, b) => b.spread - a.spread);
      });
      return value;
    });
  }

  const ms = Date.now() - started;
  const slowest =
    timings.length > 0 ? Math.max(...timings.map((t) => t.ms)) : 0;
  console.log(
    `[/api/warmup] ${timings.length} tasks in ${ms}ms (slowest ${slowest}ms)`,
  );
  return NextResponse.json({
    warmed: true,
    ms,
    routes: timings.sort((a, b) => b.ms - a.ms),
    timestamp: new Date().toISOString(),
  });
}
