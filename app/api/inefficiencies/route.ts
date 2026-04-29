/**
 * GET /api/inefficiencies
 *
 * Computes four inefficiency signals across the live market universe:
 *
 *   1. resolution_bias           — category × exchange NO-rate anomalies
 *                                  (from resolved markets; NO rate > 65% flagged)
 *   2. cross_venue_divergence    — matched markets whose YES price differs
 *                                  between Polymarket and Kalshi by > 3pp
 *   3. liquidity_gap             — markets whose volume24h / liquidity ratio
 *                                  exceeds mean + 2σ of the population
 *   4. late_breaking_mismatch    — resolved markets whose last-hour OHLCV
 *                                  close mispriced vs actual resolution > 15pp
 *
 * Cache key: inefficiencies:all
 * TTL:       300s
 */

import { NextResponse } from "next/server";
import { cached } from "@/lib/redis";
import { fetchOhlcv, hasPmxtKey, resolveOhlcvId, router } from "@/lib/pmxt";
import { mockMarkets, assignResolutionLabels, mockOhlcv } from "@/lib/mock";
import {
  isResolved,
  mean,
  normalizeCategory,
  proportionZ,
  stddev,
  titleSimilarity,
  yesOutcome,
} from "@/lib/utils";
import type {
  Exchange,
  InefficiencyScore,
  UnifiedMarket,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_RATE_FLAG = 0.65;
const DIVERGENCE_FLAG = 0.03;
const MISMATCH_FLAG = 0.15;
const MAX_LATE_BREAKING_PROBES = 8; // OHLCV calls are expensive — cap per run.

export async function GET() {
  try {
    const { value, state } = await cached("inefficiencies:all", 300, async () => {
      if (!hasPmxtKey()) {
        const active = mockMarkets({});
        const resolved = assignResolutionLabels(mockMarkets({ closed: true }));
        return {
          source: "mock" as const,
          scores: await computeAll(active, resolved, { useMockOhlcv: true }),
        };
      }

      const [polyActive, kalshiActive, polyClosed, kalshiClosed] =
        await Promise.all([
          router.markets({ exchange: "polymarket", limit: 500 }),
          router.markets({ exchange: "kalshi", limit: 500 }),
          router.markets({ exchange: "polymarket", closed: true, limit: 500 }),
          router.markets({ exchange: "kalshi", closed: true, limit: 500 }),
        ]);

      const tag = (ex: Exchange) => (m: UnifiedMarket) => ({ ...m, exchange: ex });
      const active = [
        ...polyActive.data.map(tag("polymarket")),
        ...kalshiActive.data.map(tag("kalshi")),
      ];
      const resolved = [
        ...polyClosed.data.map(tag("polymarket")),
        ...kalshiClosed.data.map(tag("kalshi")),
      ];

      return {
        source: "pmxt" as const,
        scores: await computeAll(active, resolved, { useMockOhlcv: false }),
      };
    });

    return NextResponse.json(
      {
        data: value.scores,
        cache: state,
        fetchedAt: new Date().toISOString(),
        source: value.source,
      },
      { headers: { "X-Cache": state, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[/api/inefficiencies] failure", err);
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

// ---------------------------------------------------------------------------
// Signal computation
// ---------------------------------------------------------------------------

async function computeAll(
  active: UnifiedMarket[],
  resolved: UnifiedMarket[],
  { useMockOhlcv }: { useMockOhlcv: boolean },
): Promise<InefficiencyScore[]> {
  const scores: InefficiencyScore[] = [];

  scores.push(...resolutionBiasSignals(resolved));
  scores.push(...crossVenueDivergenceSignals(active));
  scores.push(...liquidityGapSignals(active));
  scores.push(
    ...(await lateBreakingMismatchSignals(resolved, { useMockOhlcv })),
  );

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 200);
}

// 1. Resolution bias — one row per biased (category, exchange) bucket.
function resolutionBiasSignals(resolved: UnifiedMarket[]): InefficiencyScore[] {
  const tally = new Map<
    string,
    { category: string; exchange: Exchange; yes: number; no: number }
  >();

  for (const m of resolved) {
    if (!isResolved(m)) continue;
    const cat = normalizeCategory(m.category);
    const ex = (m.exchange ?? "polymarket") as Exchange;
    const yes = m.outcomes.find((o) => /^yes$/i.test(o.label));
    const no = m.outcomes.find((o) => /^no$/i.test(o.label));
    if (!yes && !no) continue;

    const bucketKey = `${cat}|${ex}`;
    const bucket = tally.get(bucketKey) ?? {
      category: cat,
      exchange: ex,
      yes: 0,
      no: 0,
    };
    if ((yes?.price ?? 0) >= 0.8) bucket.yes += 1;
    else if ((no?.price ?? 0) >= 0.8) bucket.no += 1;
    tally.set(bucketKey, bucket);
  }

  const rows: InefficiencyScore[] = [];
  for (const { category, exchange, yes, no } of tally.values()) {
    const total = yes + no;
    if (total < 10) continue; // not enough data
    const noRate = no / total;
    if (noRate < NO_RATE_FLAG) continue;

    const z = proportionZ(noRate, total, 0.5);
    rows.push({
      id: `bias-${exchange}-${category}`,
      marketId: `bias:${exchange}:${category}`,
      title: `${category} markets on ${exchange} resolving NO ${(noRate * 100).toFixed(0)}%`,
      exchange,
      category,
      type: "resolution_bias",
      score: Math.min(100, Math.round(Math.abs(z) * 10 + noRate * 50)),
      details: `${no}/${total} resolved NO (z=${z.toFixed(2)})`,
      noResolutionRate: noRate,
      zScore: z,
      lastUpdated: new Date().toISOString(),
    });
  }
  return rows;
}

// 2. Cross-venue divergence — match markets by fuzzy title similarity.
function crossVenueDivergenceSignals(
  active: UnifiedMarket[],
): InefficiencyScore[] {
  const poly = active.filter((m) => m.exchange === "polymarket");
  const kalshi = active.filter((m) => m.exchange === "kalshi");

  const rows: InefficiencyScore[] = [];
  const usedKalshi = new Set<string>();

  for (const p of poly) {
    const py = yesOutcome(p);
    if (!py) continue;

    let bestMatch: { k: UnifiedMarket; sim: number } | null = null;
    for (const k of kalshi) {
      if (usedKalshi.has(k.marketId)) continue;
      const sim = titleSimilarity(p.title, k.title);
      if (sim >= 0.5 && (!bestMatch || sim > bestMatch.sim)) {
        bestMatch = { k, sim };
      }
    }
    if (!bestMatch) continue;
    usedKalshi.add(bestMatch.k.marketId);

    const ky = yesOutcome(bestMatch.k);
    if (!ky) continue;

    const spread = Math.abs(py.price - ky.price);
    if (spread < DIVERGENCE_FLAG) continue;

    rows.push({
      id: `div-${p.marketId}-${bestMatch.k.marketId}`,
      marketId: p.marketId,
      title: p.title,
      exchange: "polymarket",
      category: normalizeCategory(p.category),
      type: "cross_venue_divergence",
      score: Math.min(100, Math.round(spread * 1000)),
      details: `Poly YES ${(py.price * 100).toFixed(1)}% vs Kalshi YES ${(ky.price * 100).toFixed(1)}% (spread ${(spread * 100).toFixed(1)}pp, title sim ${(bestMatch.sim * 100).toFixed(0)}%)`,
      counterpartyMarketId: bestMatch.k.marketId,
      counterpartyExchange: "kalshi",
      spread,
      lastUpdated: new Date().toISOString(),
    });
  }
  return rows;
}

// 3. Liquidity gap — volume24h / liquidity ratio >> mean + 2σ.
function liquidityGapSignals(active: UnifiedMarket[]): InefficiencyScore[] {
  const ratios = active
    .filter((m) => m.liquidity > 0 && m.volume24h > 0)
    .map((m) => m.volume24h / m.liquidity);
  if (ratios.length < 10) return [];

  const m = mean(ratios);
  const sd = stddev(ratios);
  const threshold = m + 2 * sd;

  const rows: InefficiencyScore[] = [];
  for (const mk of active) {
    if (mk.liquidity <= 0 || mk.volume24h <= 0) continue;
    const ratio = mk.volume24h / mk.liquidity;
    if (ratio <= threshold) continue;

    rows.push({
      id: `liq-${mk.marketId}`,
      marketId: mk.marketId,
      title: mk.title,
      exchange: (mk.exchange ?? "polymarket") as Exchange,
      category: normalizeCategory(mk.category),
      type: "liquidity_gap",
      score: Math.min(100, Math.round((ratio / threshold) * 40)),
      details: `Vol/Liq ratio ${ratio.toFixed(2)} vs mean ${m.toFixed(2)} (σ=${sd.toFixed(2)}, threshold ${threshold.toFixed(2)})`,
      liquidityRatio: ratio,
      liquidityPopulation: {
        mean: m,
        sd,
        threshold,
        n: ratios.length,
      },
      lastUpdated: new Date().toISOString(),
    });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, 25);
}

// 4. Late-breaking mismatch — final price vs actual resolution.
async function lateBreakingMismatchSignals(
  resolved: UnifiedMarket[],
  { useMockOhlcv }: { useMockOhlcv: boolean },
): Promise<InefficiencyScore[]> {
  // Pick the most recently resolved markets across both venues; OHLCV is
  // rate-limited, so cap the number of probes.
  const recent = [...resolved]
    .filter((m) => isResolved(m) && yesOutcome(m))
    .sort((a, b) => {
      const ta = a.resolutionDate ? Date.parse(a.resolutionDate) : 0;
      const tb = b.resolutionDate ? Date.parse(b.resolutionDate) : 0;
      return tb - ta;
    })
    .slice(0, MAX_LATE_BREAKING_PROBES);

  const rows: InefficiencyScore[] = [];
  for (const m of recent) {
    const yes = yesOutcome(m);
    if (!yes) continue;
    const exchange = (m.exchange ?? "polymarket") as Exchange;

    // Resolve to a sidecar-acceptable identifier (Kalshi needs a ticker like
    // "FED-25JAN29-B4.75"; the router sometimes hands back a numeric ID which
    // the Kalshi sidecar rejects). Skip silently when we can't find one.
    const probeId = useMockOhlcv ? yes.outcomeId : resolveOhlcvId(m, yes);
    if (!probeId) continue;

    try {
      const candles = useMockOhlcv
        ? mockOhlcv(probeId, { limit: 72 })
        : await fetchOhlcv(exchange, probeId, { resolution: "1h", limit: 72 });
      if (candles.length === 0) continue;
      const last = candles[candles.length - 1];
      const mismatch = Math.abs(last.close - yes.price);
      if (mismatch < MISMATCH_FLAG) continue;
      rows.push({
        id: `late-${m.marketId}`,
        marketId: m.marketId,
        title: m.title,
        exchange,
        category: normalizeCategory(m.category),
        type: "late_breaking_mismatch",
        score: Math.min(100, Math.round(mismatch * 200)),
        details: `Final hour close ${(last.close * 100).toFixed(1)}% vs resolution ${(yes.price * 100).toFixed(0)}% (Δ ${(mismatch * 100).toFixed(1)}pp)`,
        spread: mismatch,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      // Log only a single-line summary — PMXT sidecar errors include a full
      // stack that clutters dev logs without adding info. These are expected
      // whenever the router's outcomeId doesn't match the sidecar's schema.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[late-breaking] probe skipped for ${exchange}:${m.marketId} — ${msg}`,
      );
    }
  }
  return rows;
}
