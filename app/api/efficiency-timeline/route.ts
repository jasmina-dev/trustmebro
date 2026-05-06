/**
 * GET /api/efficiency-timeline
 *
 * Chart C — "Are markets getting more or less efficient over time?"
 *
 * For every closed market, we compute the "mispricing" as the absolute
 * difference between its final YES price and its actual resolution (1 for
 * YES-won, 0 for NO-won). Then we group by `resolutionDate` month and take
 * the volume-weighted mean mispricing per (venue × month). High-volume
 * mispricings weigh more — calibration on a $10M market matters more than
 * calibration on a $500 one.
 *
 * Cache key: efficiency-timeline:v7
 * TTL:       3600s
 *
 * v7 — lower MIN_MARKETS_PER_MONTH default (5 → 2, env-overridable) so the
 *      timeline isn't reduced to a single bar when PMXT only fills
 *      `resolutionDate` on a handful of recent markets per venue/month.
 *      Also returns coverage diagnostics in `meta.coverage` so the chart
 *      can explain sparsity to the user.
 */

import { NextResponse } from "next/server";
import { CC_HOURLY_AGG, jsonCacheHeaders } from "@/lib/cacheHeaders";
import { cached } from "@/lib/redis";
import { fetchClosedMarketsForAnalytics } from "@/lib/analyticsClosedMarkets";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets, assignResolutionLabels } from "@/lib/mock";
import { classifyWinnerLabel } from "@/lib/bias";
import { impliedYesForAnalytics } from "@/lib/calibrationPrice";
import type {
  EfficiencyMonth,
  Exchange,
  UnifiedMarket,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];
const TTL = 3600;
/**
 * Months below this many resolved markets per venue are dropped to avoid
 * single-market noise dominating the volume-weighted mean. Default 2 keeps
 * the timeline visible even when PMXT only populates `resolutionDate` on a
 * handful of recent markets per month — set `EFFICIENCY_MIN_MARKETS_PER_MONTH`
 * higher (e.g. 5) once a fuller closed-market backfill is wired up.
 */
const MIN_MARKETS_PER_MONTH_ENV = Number(
  process.env.EFFICIENCY_MIN_MARKETS_PER_MONTH,
);
const MIN_MARKETS_PER_MONTH =
  Number.isFinite(MIN_MARKETS_PER_MONTH_ENV) && MIN_MARKETS_PER_MONTH_ENV >= 1
    ? Math.floor(MIN_MARKETS_PER_MONTH_ENV)
    : 2;

function monthKey(iso: string): string | null {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * One (venue × month) bucket: accumulates volume-weighted mispricing.
 * Mean = sum(|price − resolution| * volume) / sum(volume).
 */
interface Accum {
  totalWeight: number;
  weightedMispricing: number;
  count: number;
}

function accumulate(
  buckets: Map<string, Accum>,
  key: string,
  mispricing: number,
  weight: number,
) {
  const b = buckets.get(key) ?? {
    totalWeight: 0,
    weightedMispricing: 0,
    count: 0,
  };
  b.totalWeight += weight;
  b.weightedMispricing += mispricing * weight;
  b.count += 1;
  buckets.set(key, b);
}

function processMarket(
  m: UnifiedMarket,
  buckets: Map<string, Accum>,
  volumes: Map<string, number>,
): boolean {
  if (!m.resolutionDate) return false;
  const month = monthKey(m.resolutionDate);
  if (!month) return false;
  if (m.outcomes.length === 0) return false;

  const winner = m.outcomes.reduce(
    (a, b) => (a.price > b.price ? a : b),
    m.outcomes[0],
  );
  if (winner.price < 0.8) return false;

  const winnerKind = classifyWinnerLabel(winner.label);
  if (winnerKind === "ambiguous") return false;

  const { price: priceAtClose } = impliedYesForAnalytics(m);
  if (priceAtClose === null) return false;

  const resolution = winnerKind === "yes" ? 1 : 0;
  const mispricing = Math.abs(priceAtClose - resolution);

  // Volume weight — clamp to a small floor so zero-volume markets still
  // show up, but don't dominate.
  const weight = Math.max(1, m.volume ?? 0);

  const exchange = (m.exchange ?? "polymarket") as Exchange;
  const key = `${exchange}|${month}`;
  accumulate(buckets, key, mispricing, weight);
  volumes.set(key, (volumes.get(key) ?? 0) + (m.volume ?? 0));
  return true;
}

interface BuildTimelineResult {
  rows: EfficiencyMonth[];
  /** All processable markets (had resolutionDate, decisive winner, classifiable). */
  observed: number;
  /** Markets skipped because resolutionDate was missing/unparseable. */
  missingResolutionDate: number;
  /** Months with < MIN_MARKETS_PER_MONTH per venue (dropped from rows). */
  monthsBelowFloor: number;
}

function buildTimeline(markets: UnifiedMarket[]): BuildTimelineResult {
  const buckets = new Map<string, Accum>();
  const volumes = new Map<string, number>();
  let observed = 0;
  let missingResolutionDate = 0;

  for (const m of markets) {
    if (!m.resolutionDate || !Number.isFinite(Date.parse(m.resolutionDate))) {
      missingResolutionDate += 1;
      continue;
    }
    if (processMarket(m, buckets, volumes)) observed += 1;
  }

  const monthsSet = new Set<string>();
  buckets.forEach((_, key) => {
    monthsSet.add(key.split("|")[1]);
  });
  const months = Array.from(monthsSet).sort();
  let monthsBelowFloor = 0;

  const rows = months.map((month) => {
    const row: EfficiencyMonth = { month };
    let venuesAccepted = 0;
    for (const ex of EXCHANGES) {
      const bucket = buckets.get(`${ex}|${month}`);
      if (!bucket || bucket.count < MIN_MARKETS_PER_MONTH) continue;
      venuesAccepted += 1;
      const mispricing =
        Math.round((bucket.weightedMispricing / bucket.totalWeight) * 1000) /
        10;
      // Assign venue-keyed fields through a permissive index cast; the
      // EfficiencyMonth shape declares these as optional but TS can't
      // narrow the template-literal key at assignment time.
      const w = row as unknown as Record<string, number>;
      w[ex] = mispricing;
      w[`${ex}N`] = bucket.count;
      w[`${ex}Volume`] = volumes.get(`${ex}|${month}`) ?? 0;
    }
    if (venuesAccepted === 0) monthsBelowFloor += 1;
    return row;
  });

  return {
    rows: rows.filter((r) => Object.keys(r).length > 1),
    observed,
    missingResolutionDate,
    monthsBelowFloor,
  };
}

export async function GET() {
  try {
    if (!hasPmxtKey()) {
      const markets = assignResolutionLabels(mockMarkets({ closed: true }));
      const result = buildTimeline(markets);
      return NextResponse.json(
        {
          data: result.rows,
          meta: {
            coverage: {
              closedMarketsConsidered: markets.length,
              missingResolutionDate: result.missingResolutionDate,
              processedObservations: result.observed,
              monthsBelowFloor: result.monthsBelowFloor,
              minMarketsPerMonth: MIN_MARKETS_PER_MONTH,
            },
          },
          cache: "MISS",
          fetchedAt: new Date().toISOString(),
          source: "mock",
        },
        { headers: jsonCacheHeaders("MISS", CC_HOURLY_AGG) },
      );
    }

    const { value, state } = await cached("efficiency-timeline:v7", TTL, async () => {
      const chunks = await Promise.all(
        EXCHANGES.map((ex) => fetchClosedMarketsForAnalytics(ex)),
      );
      const all = chunks.flat();
      const result = buildTimeline(all);
      return { ...result, closedMarketsConsidered: all.length };
    });

    const result = value as BuildTimelineResult & { closedMarketsConsidered: number };
    console.log(
      `[/api/efficiency-timeline] v7 closedMarkets=${result.closedMarketsConsidered}, ` +
        `processed=${result.observed}, missingResolutionDate=${result.missingResolutionDate}, ` +
        `months=${result.rows.length}, monthsBelowFloor=${result.monthsBelowFloor}, ` +
        `minPerMonth=${MIN_MARKETS_PER_MONTH}`,
    );
    return NextResponse.json(
      {
        data: result.rows,
        meta: {
          coverage: {
            closedMarketsConsidered: result.closedMarketsConsidered,
            missingResolutionDate: result.missingResolutionDate,
            processedObservations: result.observed,
            monthsBelowFloor: result.monthsBelowFloor,
            minMarketsPerMonth: MIN_MARKETS_PER_MONTH,
          },
        },
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: "pmxt",
      },
      { headers: jsonCacheHeaders(state, CC_HOURLY_AGG) },
    );
  } catch (err) {
    console.error("[/api/efficiency-timeline] failure", err);
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
