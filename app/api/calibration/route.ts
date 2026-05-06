/**
 * GET /api/calibration
 *
 * Builds the data for Chart B — "Do markets resolve accurately when the
 * price is stable vs volatile?"
 *
 * For every clearly-resolved market we compute:
 *   • implied YES — `preResolutionYesPrice` when present (mock); else mid-range
 *     YES `price` when available; else last-trade YES `price` (`settlement`
 *     basis — see `meta.impliedYesBasis` counts; Router only exposes last trade).
 *   • resolution — 1 when YES won, 0 when NO won (skipped otherwise)
 *
 * Closed markets are loaded like `/api/resolution-bias` (no Router `category=`,
 * high page cap, local `calibrationRowCategory` taxonomy including Sports→Other).
 *
 * `meta.impliedYesBasis` is forwarded so the chart UI can warn the user when
 * the curve is dominated by settlement-basis observations (in which case
 * priceAtClose ≈ resolution by construction → trivial diagonal).
 *
 * Cache key: calibration:v7
 * TTL:       3600s — derived exclusively from already-cached closed markets
 *
 * v7 — adds `meta.impliedYesBasis` echo + `meta.coverage.totalObservations`
 *      so the UI can explain why the curve collapses to the diagonal when
 *      only settlement prices are available (real fix: per-market OHLCV
 *      sampling for true pre-resolution prices, see follow-up).
 */

import { NextResponse } from "next/server";
import { CC_HOURLY_AGG, jsonCacheHeaders } from "@/lib/cacheHeaders";
import { cached } from "@/lib/redis";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets, assignResolutionLabels } from "@/lib/mock";
import { classifyWinnerLabel } from "@/lib/bias";
import {
  impliedYesForAnalytics,
  type ImpliedYesBasis,
} from "@/lib/calibrationPrice";
import {
  CALIBRATION_ROW_CATEGORIES,
  calibrationRowCategory,
  fetchClosedMarketsForAnalytics,
} from "@/lib/analyticsClosedMarkets";
import type {
  CalibrationBucket,
  CalibrationSeries,
  Exchange,
  UnifiedMarket,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CATEGORIES = CALIBRATION_ROW_CATEGORIES;
const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];
const BUCKETS = 10;
const TTL = 3600;

interface Observation {
  priceAtClose: number;
  resolution: 0 | 1;
}

function extractObservations(markets: UnifiedMarket[]): {
  observations: Observation[];
  impliedBasis: Record<ImpliedYesBasis, number>;
} {
  const impliedBasis: Record<ImpliedYesBasis, number> = {
    pinned: 0,
    mid: 0,
    settlement: 0,
  };
  const observations: Observation[] = [];
  for (const m of markets) {
    if (m.outcomes.length === 0) continue;
    const winner = m.outcomes.reduce(
      (a, b) => (a.price > b.price ? a : b),
      m.outcomes[0],
    );
    if (winner.price < 0.8) continue;

    const winnerKind = classifyWinnerLabel(winner.label);
    if (winnerKind === "ambiguous") continue;

    const resolution: 0 | 1 = winnerKind === "yes" ? 1 : 0;

    const { price: priceAtClose, basis } = impliedYesForAnalytics(m);
    if (priceAtClose === null || basis === null || !Number.isFinite(priceAtClose)) {
      continue;
    }
    impliedBasis[basis] += 1;
    observations.push({ priceAtClose, resolution });
  }
  return { observations, impliedBasis };
}

function addBasis(
  a: Record<ImpliedYesBasis, number>,
  b: Record<ImpliedYesBasis, number>,
): void {
  (Object.keys(a) as ImpliedYesBasis[]).forEach((k) => {
    a[k] += b[k];
  });
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
      const metaBasis: Record<ImpliedYesBasis, number> = {
        pinned: 0,
        mid: 0,
        settlement: 0,
      };
      for (const ex of EXCHANGES) {
        for (const cat of CATEGORIES) {
          const filtered = markets.filter(
            (m) => m.exchange === ex && calibrationRowCategory(m) === cat,
          );
          const { observations, impliedBasis } = extractObservations(filtered);
          addBasis(metaBasis, impliedBasis);
          series.push({
            exchange: ex,
            category: cat,
            buckets: bucketObservations(observations),
            totalMarkets: observations.length,
          });
        }
      }
      return NextResponse.json(
        {
          data: series,
          meta: { impliedYesBasis: metaBasis },
          cache: "MISS",
          fetchedAt: new Date().toISOString(),
          source: "mock",
        },
        { headers: jsonCacheHeaders("MISS", CC_HOURLY_AGG) },
      );
    }

    const { value, state } = await cached("calibration:v7", TTL, async () => {
      const impliedYesBasis: Record<ImpliedYesBasis, number> = {
        pinned: 0,
        mid: 0,
        settlement: 0,
      };
      const series: CalibrationSeries[] = [];

      const byExchange = await Promise.all(
        EXCHANGES.map(async (exchange) => {
          const markets = await fetchClosedMarketsForAnalytics(exchange);
          return { exchange, markets };
        }),
      );

      for (const { exchange: ex, markets } of byExchange) {
        for (const cat of CATEGORIES) {
          const filtered = markets.filter(
            (m) => m.exchange === ex && calibrationRowCategory(m) === cat,
          );
          const { observations, impliedBasis } = extractObservations(filtered);
          addBasis(impliedYesBasis, impliedBasis);
          series.push({
            exchange: ex,
            category: cat,
            buckets: bucketObservations(observations),
            totalMarkets: observations.length,
          });
        }
      }
      return { series, impliedYesBasis };
    });

    const { series, impliedYesBasis } = value as {
      series: CalibrationSeries[];
      impliedYesBasis: Record<ImpliedYesBasis, number>;
    };
    return NextResponse.json(
      {
        data: series,
        meta: { impliedYesBasis },
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
