/**
 * GET /api/calibration
 *
 * Builds the data for Chart B — "Do markets resolve accurately when the
 * price is stable vs volatile?"
 *
 * For every clearly-resolved binary market we compute:
 *   • implied YES — `preResolutionYesPrice` when present (mock seed); otherwise
 *     the listed YES price only if it is not terminal (~0/~1). Settlement
 *     snapshots encode the outcome and must not be used as "probability".
 *   • resolution — 1 when YES won, 0 when NO won (skipped otherwise)
 *
 * We bucket markets into deciles of implied YES (per venue × category)
 * and return the mean YES resolution rate per bucket. Perfect calibration lands
 * on the diagonal (when belief matches frequency — rare with sparse mid-bin data).
 *
 * Cache key: calibration:v2
 * TTL:       3600s — derived exclusively from already-cached closed markets
 */

import { NextResponse } from "next/server";
import { CC_HOURLY_AGG, jsonCacheHeaders } from "@/lib/cacheHeaders";
import { cached } from "@/lib/redis";
import { fetchAllMarkets } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets, assignResolutionLabels } from "@/lib/mock";
import { classifyWinnerLabel } from "@/lib/bias";
import { impliedYesForCalibration } from "@/lib/calibrationPrice";
import { normalizeCategory } from "@/lib/utils";
import type {
  CalibrationBucket,
  CalibrationSeries,
  Exchange,
  UnifiedMarket,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["Politics", "Crypto", "Finance", "Other"];
const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];
const BUCKETS = 10;
const TTL = 3600;

interface Observation {
  priceAtClose: number;
  resolution: 0 | 1;
}

function extractObservations(markets: UnifiedMarket[]): Observation[] {
  const obs: Observation[] = [];
  for (const m of markets) {
    const status = (m.status ?? "").toLowerCase();
    if (status !== "resolved" && status !== "closed" && status !== "settled") {
      continue;
    }
    if (m.outcomes.length === 0) continue;
    const winner = m.outcomes.reduce(
      (a, b) => (a.price > b.price ? a : b),
      m.outcomes[0],
    );
    if (winner.price < 0.8) continue;

    const winnerKind = classifyWinnerLabel(winner.label);
    if (winnerKind === "ambiguous") continue;

    // Resolution is 1 if YES won, 0 if NO won.
    const resolution: 0 | 1 = winnerKind === "yes" ? 1 : 0;

    // Never use terminal YES prices (~0/~1) — they encode the outcome.
    const priceAtClose = impliedYesForCalibration(m);
    if (priceAtClose === null || !Number.isFinite(priceAtClose)) continue;
    obs.push({ priceAtClose, resolution });
  }
  return obs;
}

function bucketObservations(obs: Observation[]): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = Array.from({ length: BUCKETS }, (_, i) => ({
    bucketIndex: i,
    bucketStart: i / BUCKETS,
    bucketEnd: (i + 1) / BUCKETS,
    meanPrice: 0,
    resolutionRate: 0,
    count: 0,
  }));
  const sumPrice = new Array(BUCKETS).fill(0);
  const sumResolution = new Array(BUCKETS).fill(0);

  for (const o of obs) {
    const idx = Math.min(BUCKETS - 1, Math.floor(o.priceAtClose * BUCKETS));
    sumPrice[idx] += o.priceAtClose;
    sumResolution[idx] += o.resolution;
    buckets[idx].count += 1;
  }

  for (let i = 0; i < BUCKETS; i++) {
    if (buckets[i].count === 0) continue;
    buckets[i].meanPrice = sumPrice[i] / buckets[i].count;
    buckets[i].resolutionRate = sumResolution[i] / buckets[i].count;
  }
  return buckets;
}

export async function GET() {
  try {
    if (!hasPmxtKey()) {
      const markets = assignResolutionLabels(mockMarkets({ closed: true }));
      const series: CalibrationSeries[] = [];
      for (const ex of EXCHANGES) {
        for (const cat of CATEGORIES) {
          const filtered = markets.filter(
            (m) =>
              m.exchange === ex && normalizeCategory(m.category) === cat,
          );
          const obs = extractObservations(filtered);
          series.push({
            exchange: ex,
            category: cat,
            buckets: bucketObservations(obs),
            totalMarkets: obs.length,
          });
        }
      }
      return NextResponse.json(
        {
          data: series,
          cache: "MISS",
          fetchedAt: new Date().toISOString(),
          source: "mock",
        },
        { headers: jsonCacheHeaders("MISS", CC_HOURLY_AGG) },
      );
    }

    const { value, state } = await cached("calibration:v2", TTL, async () => {
      const all = await Promise.all(
        EXCHANGES.flatMap((ex) =>
          CATEGORIES.map(async (cat) => {
            const { markets } = await fetchAllMarkets({
              exchange: ex,
              category: cat,
              closed: true,
            });
            const obs = extractObservations(markets);
            return {
              exchange: ex,
              category: cat,
              buckets: bucketObservations(obs),
              totalMarkets: obs.length,
            } satisfies CalibrationSeries;
          }),
        ),
      );
      return all;
    });

    const series = value as CalibrationSeries[];
    return NextResponse.json(
      {
        data: series,
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: "pmxt",
      },
      { headers: jsonCacheHeaders(state, CC_HOURLY_AGG) },
    );
  } catch (err) {
    console.error("[/api/calibration] failure", err);
    return NextResponse.json(
      {
        data: [],
        cache: "BYPASS",
        fetchedAt: new Date().toISOString(),
        source: "mock",
        error: (err as Error).message,
      },
      { status: 200, headers: jsonCacheHeaders("BYPASS", "no-store") },
    );
  }
}
