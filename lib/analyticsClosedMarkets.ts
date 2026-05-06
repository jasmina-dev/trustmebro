/**
 * Closed-market pulls for dashboard analytics.
 *
 * Match `/api/resolution-bias`: one crawl per venue with no Router `category=`
 * filter (venue labels miss Kalshi and many Polymarket rows), reuse the same
 * pagination cap and TTL so `raw:v5:*` page keys align.
 */

import { fetchAllMarkets } from "./fetchAll";
import {
  RESOLUTION_BIAS_MAX_PAGES,
  RESOLUTION_BIAS_TTL_SECONDS,
} from "./resolutionBiasData";
import { resolutionBiasMarketCategory } from "./utils";
import type { Exchange, UnifiedMarket } from "./types";

/** Heatmap columns omit Sports; fold those rows into Other for calibration. */
export const CALIBRATION_ROW_CATEGORIES = [
  "Politics",
  "Crypto",
  "Finance",
  "Other",
] as const;

export type CalibrationRowCategory =
  (typeof CALIBRATION_ROW_CATEGORIES)[number];

export async function fetchClosedMarketsForAnalytics(
  exchange: Exchange,
): Promise<UnifiedMarket[]> {
  const { markets } = await fetchAllMarkets({
    exchange,
    closed: true,
    maxPages: RESOLUTION_BIAS_MAX_PAGES,
    ttlSeconds: RESOLUTION_BIAS_TTL_SECONDS,
  });
  return markets;
}

export function calibrationRowCategory(
  m: Pick<UnifiedMarket, "category" | "title">,
): CalibrationRowCategory {
  const c = resolutionBiasMarketCategory(m);
  if (c === "Sports") return "Other";
  if (
    c === "Politics" ||
    c === "Crypto" ||
    c === "Finance" ||
    c === "Other"
  ) {
    return c;
  }
  return "Other";
}
