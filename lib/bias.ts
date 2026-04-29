/**
 * Resolution-bias computation — shared between the `/api/resolution-bias`
 * handler and the `/api/warmup` prewarmer so both take the same path.
 *
 * Philosophy:
 *   • Only binary markets count — exactly 2 outcomes where one side is
 *     identifiable as YES ("Yes", "Yes …", custom label) and the other as NO
 *     ("No", "Not …", "No …"). Multi-choice markets (team names, etc.) are
 *     excluded entirely.
 *   • Resolution is confirmed by price ≥ 0.8 on the winning side. We don't
 *     check market status strings — the API already filters with closed=true
 *     and venue status strings vary ("resolved", "settled", "finalized", …).
 */

import { proportionZ } from "./utils";
import type { Exchange, ResolutionBiasBucket, UnifiedMarket } from "./types";

export const LOW_SAMPLE = 30;
export const FLAG_NO_RATE = 0.65;

export function classifyWinnerLabel(label: string): "yes" | "no" | "ambiguous" {
  const l = label.trim().toLowerCase();
  // Exact match
  if (l === "yes") return "yes";
  if (l === "no") return "no";
  // "Yes"-prefixed variants (e.g. "Yes, before 12/31", "Yes (conditional)")
  if (l.startsWith("yes ") || l.startsWith("yes,")) return "yes";
  // "No"-prefixed or "Not"-prefixed (e.g. "No, or after", "Not April 30")
  if (l.startsWith("no ") || l.startsWith("no,") || l.startsWith("not ")) return "no";
  // " no " as a standalone word anywhere in the label
  if (/ no /.test(` ${l} `)) return "no";
  return "ambiguous";
}

/**
 * Identify which of two outcomes is the YES side and which is the NO side.
 *
 * Handles two common patterns:
 *   1. Explicit labels — "Yes" / "No" (Kalshi, some Polymarket)
 *   2. "X" / "Not X"  — e.g. "April 30" / "Not April 30" (Polymarket event
 *      markets). Here the "Not …" / "No …" side is the NO outcome and the
 *      other side is YES.
 *
 * Returns null when neither side can be identified (multi-choice markets
 * like "Trump" / "Harris" / "Other" — they should not count toward binary
 * resolution bias).
 */
function resolveBinarySides(
  outcomes: UnifiedMarket["outcomes"],
): { yesOut: UnifiedMarket["outcomes"][0]; noOut: UnifiedMarket["outcomes"][0] } | null {
  if (outcomes.length !== 2) return null;
  const [a, b] = outcomes;
  const aClass = classifyWinnerLabel(a.label);
  const bClass = classifyWinnerLabel(b.label);

  // Both ambiguous → neither is identifiable as YES or NO (e.g. team names)
  if (aClass === "ambiguous" && bClass === "ambiguous") return null;
  // Both mapped to the same side → malformed market, skip
  if (aClass === bClass) return null;

  if (aClass === "yes" || bClass === "no") return { yesOut: a, noOut: b };
  if (bClass === "yes" || aClass === "no") return { yesOut: b, noOut: a };
  return null;
}

export function computeBiasBucket(
  category: string,
  exchange: Exchange,
  markets: UnifiedMarket[],
): ResolutionBiasBucket {
  let noWins = 0;
  let yesWins = 0;
  let ambiguous = 0;

  for (const m of markets) {
    if (m.outcomes.length < 2) continue;

    const sides = resolveBinarySides(m.outcomes);
    if (!sides) {
      ambiguous += 1;
      continue;
    }

    const { yesOut, noOut } = sides;

    // Decisive-resolution guard: the winning side must be priced ≥ 0.8.
    // We rely on this instead of a status-string check — the API already
    // filters with closed=true, and venue status strings vary ("resolved",
    // "settled", "finalized", …).
    const winner = yesOut.price >= noOut.price ? yesOut : noOut;
    if (winner.price < 0.8) {
      ambiguous += 1;
      continue;
    }

    if (winner === yesOut) {
      yesWins += 1;
    } else {
      noWins += 1;
    }
  }

  const total = yesWins + noWins;
  const noRate = total === 0 ? 0 : noWins / total;
  const yesRate = total === 0 ? 0 : yesWins / total;
  const zScore = total === 0 ? 0 : proportionZ(noRate, total, 0.5);

  return {
    category,
    exchange,
    total,
    yesResolved: yesWins,
    noResolved: noWins,
    noRate,
    yesRate,
    zScore,
    ambiguous,
    flagged: total >= LOW_SAMPLE && noRate > FLAG_NO_RATE,
    lowSample: total < LOW_SAMPLE,
  };
}
