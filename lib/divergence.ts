/**
 * Cross-venue divergence matcher.
 *
 * Takes two snapshots of active markets (one per venue) and returns every
 * fuzzy-matched pair whose YES price differs by more than the threshold.
 *
 * Kept out of the route file so `/api/warmup` can call it without making an
 * internal HTTP round-trip.
 */

import stringSimilarity from "string-similarity";
import { fetchAllMarkets, timed } from "./fetchAll";
import { yesOutcome } from "./utils";
import type { DivergentPair, UnifiedMarket } from "./types";

export const SIMILARITY_THRESHOLD = 0.5;
export const SPREAD_THRESHOLD = 0.02;

function pickYes(m: UnifiedMarket): number | null {
  const yes = yesOutcome(m);
  if (!yes || !Number.isFinite(yes.price)) return null;
  if (yes.price <= 0 || yes.price >= 1) return null;
  return yes.price;
}

export function pairMarkets(
  poly: UnifiedMarket[],
  kalshi: UnifiedMarket[],
  category: string,
): DivergentPair[] {
  if (poly.length === 0 || kalshi.length === 0) return [];

  const kalshiTitles = kalshi.map((m) => m.title);
  const pairs: DivergentPair[] = [];
  const used = new Set<number>();

  for (const pm of poly) {
    const polyYes = pickYes(pm);
    if (polyYes == null) continue;

    const match = stringSimilarity.findBestMatch(pm.title, kalshiTitles);
    const { bestMatch, bestMatchIndex } = match;
    if (bestMatch.rating < SIMILARITY_THRESHOLD) continue;
    if (used.has(bestMatchIndex)) continue;

    const km = kalshi[bestMatchIndex];
    const kalshiYes = pickYes(km);
    if (kalshiYes == null) continue;

    const spread = Math.abs(polyYes - kalshiYes);
    if (spread < SPREAD_THRESHOLD) continue;

    used.add(bestMatchIndex);
    pairs.push({
      pairId: `${pm.marketId}|${km.marketId}`,
      polyMarketId: pm.marketId,
      kalshiMarketId: km.marketId,
      polyTitle: pm.title,
      kalshiTitle: km.title,
      polyYes,
      kalshiYes,
      spread,
      spreadPP: Math.round(spread * 1000) / 10,
      similarityScore: Math.round(bestMatch.rating * 1000) / 1000,
      category,
      arbitrageDirection: polyYes > kalshiYes ? "buy_kalshi" : "buy_poly",
      polyVolume24h: pm.volume24h,
      kalshiVolume24h: km.volume24h,
    });
  }

  return pairs;
}

export async function divergentPairsForCategory(
  category: string,
): Promise<DivergentPair[]> {
  const [poly, kalshi] = await Promise.all([
    timed(`divergence:fetch:poly:${category}`, () =>
      fetchAllMarkets({ exchange: "polymarket", category, closed: false }),
    ),
    timed(`divergence:fetch:kalshi:${category}`, () =>
      fetchAllMarkets({ exchange: "kalshi", category, closed: false }),
    ),
  ]);
  return pairMarkets(poly.markets, kalshi.markets, category);
}
