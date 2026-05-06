/**
 * Calibration / efficiency analytics need an implied YES probability that is
 * independent of the settled outcome. Listing APIs usually return terminal
 * outcome prices (~0 / ~1), which tautologically match resolution and fake a
 * perfect diagonal. Prefer `preResolutionYesPrice` when present (mock seed).
 *
 * For live Router data we fall back to the YES outcome's last price with basis
 * `settlement` so charts have coverage; interpret those points as "price at the
 * snapshot" rather than a true pre-resolution belief (see PMXT unified schema:
 * `price` is last trade).
 */

import { classifyWinnerLabel } from "./bias";
import type { UnifiedMarket } from "./types";

export type ImpliedYesBasis = "pinned" | "mid" | "settlement";

export function impliedYesForCalibration(m: UnifiedMarket): number | null {
  return impliedYesForAnalytics(m).price;
}

/**
 * Strict mode used in tests and anywhere we must exclude settlement snapshots.
 */
export function impliedYesStrictNoTerminal(m: UnifiedMarket): number | null {
  const pinned = m.preResolutionYesPrice;
  if (typeof pinned === "number" && Number.isFinite(pinned)) {
    if (pinned <= 0 || pinned >= 1) return null;
    return pinned;
  }

  const yesOut = m.outcomes.find(
    (o) => classifyWinnerLabel(o.label) === "yes",
  );
  if (!yesOut) return null;

  const p = yesOut.price;
  if (p < 0.08 || p > 0.92) return null;

  return p;
}

export function impliedYesForAnalytics(m: UnifiedMarket): {
  price: number | null;
  basis: ImpliedYesBasis | null;
} {
  const pinned = m.preResolutionYesPrice;
  if (typeof pinned === "number" && Number.isFinite(pinned)) {
    if (pinned <= 0 || pinned >= 1) return { price: null, basis: null };
    return { price: pinned, basis: "pinned" };
  }

  const yesOut = m.outcomes.find(
    (o) => classifyWinnerLabel(o.label) === "yes",
  );
  if (!yesOut) return { price: null, basis: null };

  const p = yesOut.price;
  if (!Number.isFinite(p) || p < 0 || p > 1) return { price: null, basis: null };

  if (p > 0.08 && p < 0.92) return { price: p, basis: "mid" };

  return { price: p, basis: "settlement" };
}
