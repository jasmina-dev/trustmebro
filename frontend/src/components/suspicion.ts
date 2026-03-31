import type { PolymarketEvent, TradesAnalytics } from "../api/client";

export type SuspicionLevel = "high" | "medium" | "low";

/** Shown next to charts; keep in sync with `computeEventSuspicion` logic. */
export const SUSPICION_SIGNAL_DISCLAIMER =
  "Suspicion levels are a research heuristic—not evidence of wrongdoing. " +
  "They combine: unusually high event volume (vs. category peers), " +
  "cross-market probability inconsistencies, this event's share of recent global trade volume, " +
  "aggregate late-window volume concentration, top-whale share when this event also captures " +
  "enough of the window, and rank among trending bars.";

function conditionIdsForEvent(event: PolymarketEvent): Set<string> {
  const ids = new Set<string>();
  for (const m of event.markets ?? []) {
    if (m.conditionId) ids.add(m.conditionId);
  }
  return ids;
}

/**
 * Heuristic signal level for trending bars using global trade aggregates
 * (per-market volume), structural flags, and pre-deadline concentration.
 */
export function computeEventSuspicion(
  event: PolymarketEvent,
  opts: {
    highVolumeEventIds: Set<string>;
    inconsistentTitles: Set<string>;
    trades: TradesAnalytics | null;
    chartVolumeRank: number;
    totalChartBars: number;
  },
): SuspicionLevel {
  if (opts.highVolumeEventIds.has(event.id)) return "high";
  if (event.title && opts.inconsistentTitles.has(event.title)) return "high";

  const totalVol = opts.trades?.totalVolume ?? 0;
  const ids = conditionIdsForEvent(event);
  let eventTradeVol = 0;
  if (opts.trades?.perMarket?.length && ids.size) {
    for (const pm of opts.trades.perMarket) {
      if (ids.has(pm.conditionId)) eventTradeVol += pm.volume;
    }
  }

  const share = totalVol > 0 ? eventTradeVol / totalVol : 0;
  const pdShare = opts.trades?.preDeadlineWindow?.shareOfTotalVolume ?? 0;
  const topWhaleShare = opts.trades?.whaleTraders?.[0]?.shareOfTotalVolume ?? 0;

  const whaleConcentrationSignal =
    topWhaleShare >= 0.12 && share >= 0.06 && opts.chartVolumeRank < 4;
  const lateBurstSignal = pdShare >= 0.28 && share >= 0.05;

  if (share >= 0.18 || whaleConcentrationSignal) return "high";
  if (share >= 0.08 || lateBurstSignal || opts.chartVolumeRank < 2)
    return "medium";
  if (opts.chartVolumeRank < Math.max(3, Math.ceil(opts.totalChartBars / 3)))
    return "medium";

  return "low";
}
