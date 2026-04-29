/**
 * Resolution-bias computation — shared between the `/api/resolution-bias`
 * handler and the `/api/warmup` prewarmer so both take the same path.
 *
 * Philosophy:
 *   • A market "counts" only when it's genuinely resolved — status in
 *     {resolved,closed,settled} AND one outcome's final price ≥ 0.8.
 *   • We decide YES vs NO by the winning outcome's label, not just by
 *     price. Multi-outcome markets (team names, candidates) land in
 *     `ambiguous` and don't pollute the binary bias rate.
 */

import { proportionZ } from "./utils";
import type { Exchange, ResolutionBiasBucket, UnifiedMarket } from "./types";

export const LOW_SAMPLE = 30;
export const FLAG_NO_RATE = 0.65;

export function classifyWinnerLabel(label: string): "yes" | "no" | "ambiguous" {
  const l = label.trim().toLowerCase();
  if (l === "yes") return "yes";
  if (l === "no") return "no";
  if (l.startsWith("not ") || / no /.test(` ${l} `)) return "no";
  return "ambiguous";
}

function isResolvedLike(m: UnifiedMarket): boolean {
  const s = (m.status ?? "").toLowerCase();
  return s === "resolved" || s === "closed" || s === "settled";
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
    if (!isResolvedLike(m)) continue;
    if (m.outcomes.length === 0) continue;

    const winner = m.outcomes.reduce(
      (a, b) => (a.price > b.price ? a : b),
      m.outcomes[0],
    );
    if (winner.price < 0.8) {
      ambiguous += 1;
      continue;
    }

    switch (classifyWinnerLabel(winner.label)) {
      case "yes":
        yesWins += 1;
        break;
      case "no":
        noWins += 1;
        break;
      default:
        ambiguous += 1;
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
