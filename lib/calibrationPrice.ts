/**
 * Calibration / efficiency analytics need an implied YES probability that is
 * independent of the settled outcome. Listing APIs usually return terminal
 * outcome prices (~0 / ~1), which tautologically match resolution and fake a
 * perfect diagonal. Prefer `preResolutionYesPrice` when present (mock seed).
 */

import { classifyWinnerLabel } from "./bias";
import type { UnifiedMarket } from "./types";

export function impliedYesForCalibration(m: UnifiedMarket): number | null {
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
  // Settlement snapshot — encodes the outcome, not pre-resolution belief.
  if (p < 0.08 || p > 0.92) return null;

  return p;
}
