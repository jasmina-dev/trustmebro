/**
 * GET /api/warmup
 *
 * Prewarms every cache key the dashboard needs on first paint:
 *   • /api/markets         both venues, live
 *   • /api/resolution-bias all (venue × category) cells
 *   • /api/divergence      all categories
 *
 * Intended to be hit by a Vercel cron every 5 min (see vercel.json). Calling
 * it manually is also safe — everything is cache-read-through and idempotent.
 *
 * Response: { warmed: true, ms, routes: [...] } so you can spot-check timing.
 */

import { NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { fetchAllMarkets } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import { computeBiasBucket } from "@/lib/bias";
import { divergentPairsForCategory } from "@/lib/divergence";
import type { Exchange } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORIES = ["Sports", "Politics", "Crypto", "Finance", "Other"];
const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];

export async function GET() {
  const started = Date.now();

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

  // 1. Live markets per venue (powers KPI + liquidity scatter + momentum chart)
  const liveMarkets = EXCHANGES.map((ex) =>
    track(`markets:${ex}:live`, () => fetchAllMarkets({ exchange: ex })),
  );

  // 2. Resolution-bias cells — one per (venue, category).
  const biasCells = EXCHANGES.flatMap((ex) =>
    CATEGORIES.map((cat) =>
      track(`bias:${ex}:${cat}`, () =>
        cached(
          `resolution-bias:${ex}:${cat}`,
          3600,
          async () => {
            const { markets } = await fetchAllMarkets({
              exchange: ex,
              category: cat,
              closed: true,
            });
            return computeBiasBucket(cat, ex, markets);
          },
        ),
      ),
    ),
  );

  // 3. Divergence per category — shares the `raw:live:*` page cache with (1).
  // We compute directly instead of self-fetching so the warmer works even on
  // Vercel deployments that can't resolve their own hostname.
  const divergenceTasks = CATEGORIES.map((cat) =>
    track(`divergence:${cat}`, () =>
      cached(`divergence:${cat}`, 300, async () => {
        const pairs = await divergentPairsForCategory(cat);
        return pairs.sort((a, b) => b.spread - a.spread);
      }),
    ),
  );

  await Promise.all([...liveMarkets, ...biasCells, ...divergenceTasks]);

  const ms = Date.now() - started;
  console.log(
    `[/api/warmup] ${timings.length} tasks in ${ms}ms (slowest ${Math.max(
      ...timings.map((t) => t.ms),
    )}ms)`,
  );
  return NextResponse.json({
    warmed: true,
    ms,
    routes: timings.sort((a, b) => b.ms - a.ms),
    timestamp: new Date().toISOString(),
  });
}
