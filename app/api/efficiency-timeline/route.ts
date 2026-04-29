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
 * Cache key: efficiency-timeline
 * TTL:       3600s
 */

import { NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { fetchAllMarkets } from "@/lib/fetchAll";
import { hasPmxtKey } from "@/lib/pmxt";
import { mockMarkets, assignResolutionLabels } from "@/lib/mock";
import { classifyWinnerLabel } from "@/lib/bias";
import type {
  EfficiencyMonth,
  Exchange,
  UnifiedMarket,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["Sports", "Politics", "Crypto", "Finance", "Other"];
const EXCHANGES: Exchange[] = ["polymarket", "kalshi"];
const TTL = 3600;
const MIN_MARKETS_PER_MONTH = 5;

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
): void {
  if (!m.resolutionDate) return;
  const month = monthKey(m.resolutionDate);
  if (!month) return;
  if (m.outcomes.length === 0) return;

  const winner = m.outcomes.reduce(
    (a, b) => (a.price > b.price ? a : b),
    m.outcomes[0],
  );
  if (winner.price < 0.8) return;

  const winnerKind = classifyWinnerLabel(winner.label);
  if (winnerKind === "ambiguous") return;

  const yesOut = m.outcomes.find(
    (o) => classifyWinnerLabel(o.label) === "yes",
  );
  const priceAtClose = yesOut
    ? yesOut.price
    : winnerKind === "yes"
      ? winner.price
      : 1 - winner.price;
  const resolution = winnerKind === "yes" ? 1 : 0;
  const mispricing = Math.abs(priceAtClose - resolution);

  // Volume weight — clamp to a small floor so zero-volume markets still
  // show up, but don't dominate.
  const weight = Math.max(1, m.volume ?? 0);

  const exchange = (m.exchange ?? "polymarket") as Exchange;
  const key = `${exchange}|${month}`;
  accumulate(buckets, key, mispricing, weight);
  volumes.set(key, (volumes.get(key) ?? 0) + (m.volume ?? 0));
}

function buildTimeline(markets: UnifiedMarket[]): EfficiencyMonth[] {
  const buckets = new Map<string, Accum>();
  const volumes = new Map<string, number>();
  for (const m of markets) processMarket(m, buckets, volumes);

  const monthsSet = new Set<string>();
  buckets.forEach((_, key) => {
    monthsSet.add(key.split("|")[1]);
  });
  const months = Array.from(monthsSet).sort();

  return months.map((month) => {
    const row: EfficiencyMonth = { month };
    for (const ex of EXCHANGES) {
      const bucket = buckets.get(`${ex}|${month}`);
      if (!bucket || bucket.count < MIN_MARKETS_PER_MONTH) continue;
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
    return row;
  });
}

export async function GET() {
  try {
    if (!hasPmxtKey()) {
      // Synthesize a plausible timeline from mock markets — each mock
      // `resolutionDate` lands somewhere in the last 30 days so the series
      // will only have one month. We fan it out synthetically so the chart
      // has something to show in mock mode.
      const markets = assignResolutionLabels(mockMarkets({ closed: true }));
      const timeline = buildTimeline(markets);
      return NextResponse.json(
        {
          data: timeline,
          cache: "MISS",
          fetchedAt: new Date().toISOString(),
          source: "mock",
        },
        { headers: { "X-Cache": "MISS", "Cache-Control": "no-store" } },
      );
    }

    const { value, state } = await cached("efficiency-timeline", TTL, async () => {
      const all: UnifiedMarket[] = [];
      await Promise.all(
        EXCHANGES.flatMap((ex) =>
          CATEGORIES.map(async (cat) => {
            const { markets } = await fetchAllMarkets({
              exchange: ex,
              category: cat,
              closed: true,
            });
            all.push(...markets);
          }),
        ),
      );
      return buildTimeline(all);
    });

    const timeline = value as EfficiencyMonth[];
    return NextResponse.json(
      {
        data: timeline,
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: "pmxt",
      },
      { headers: { "X-Cache": state, "Cache-Control": "no-store" } },
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
      { status: 200, headers: { "X-Cache": "BYPASS" } },
    );
  }
}
