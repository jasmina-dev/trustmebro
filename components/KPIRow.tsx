"use client";

import useSWR from "swr";
import { useEffect, useMemo } from "react";
import { KPICard } from "./ui/KPICard";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { useDashboard } from "@/lib/store";
import type {
  InefficiencyScore,
  ResolutionBiasBucket,
  UnifiedMarket,
} from "@/lib/types";

export function KPIRow() {
  const { activeVenue, activeCategory } = useDashboard();

  const marketsUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (activeVenue !== "all") qs.set("exchange", activeVenue);
    if (activeCategory !== "All") qs.set("category", activeCategory);
    qs.set("limit", "500");
    return `/api/markets?${qs.toString()}`;
  }, [activeVenue, activeCategory]);

  const swrOpts = {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  } as const;

  const { data: markets, isLoading: loadingMarkets } = useSWR<
    ApiPayload<UnifiedMarket[]>
  >(marketsUrl, fetcher, { refreshInterval: REFRESH.live, ...swrOpts });

  const { data: resolution, isLoading: loadingRes } = useSWR<
    ApiPayload<ResolutionBiasBucket[]>
  >(
    activeCategory === "All"
      ? "/api/resolution-bias"
      : `/api/resolution-bias?category=${encodeURIComponent(activeCategory)}`,
    fetcher,
    { refreshInterval: REFRESH.resolution, ...swrOpts },
  );

  const { data: scores, isLoading: loadingScores } = useSWR<
    ApiPayload<InefficiencyScore[]>
  >("/api/inefficiencies", fetcher, {
    refreshInterval: REFRESH.inefficiencies,
    ...swrOpts,
  });

  // Push markets + scores into the global dashboard context so the chatbot
  // can answer questions about what's visible.
  const updateChartContext = useDashboard((s) => s.updateChartContext);
  const resolutionStats = resolution?.data;
  useEffect(() => {
    if (markets?.data) {
      updateChartContext("overview", {
        visibleMarkets: markets.data.slice(0, 60),
      });
    }
  }, [markets?.data, updateChartContext]);

  useEffect(() => {
    if (scores?.data) {
      updateChartContext("overview", {
        inefficiencyScores: scores.data,
      });
    }
  }, [scores?.data, updateChartContext]);

  useEffect(() => {
    if (resolutionStats) {
      updateChartContext("overview", { resolutionStats });
    }
  }, [resolutionStats, updateChartContext]);

  // ---------- Derived metrics ----------
  const totalMarkets = markets?.data?.length ?? 0;

  const avgSportsNo = useMemo(() => {
    if (!resolution?.data) return 0;
    const sport = resolution.data.filter((b) => b.category === "Sports");
    if (sport.length === 0) return 0;
    const totals = sport.reduce(
      (acc, b) => {
        acc.total += b.total;
        acc.no += b.noResolved;
        return acc;
      },
      { total: 0, no: 0 },
    );
    if (totals.total === 0) return 0;
    return totals.no / totals.total;
  }, [resolution?.data]);

  const topDivergence = useMemo(() => {
    if (!scores?.data) return 0;
    const divs = scores.data.filter(
      (s) => s.type === "cross_venue_divergence" && typeof s.spread === "number",
    );
    if (divs.length === 0) return 0;
    return Math.max(...divs.map((d) => d.spread ?? 0));
  }, [scores?.data]);

  const flaggedCount = scores?.data?.length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KPICard
        label="Markets analyzed"
        value={totalMarkets}
        hint={markets?.cache ? `cache ${markets.cache}` : undefined}
        loading={loadingMarkets}
      />
      <KPICard
        label="Avg sports NO-rate"
        value={avgSportsNo}
        format="percent"
        hint={
          avgSportsNo > 0.55
            ? "biased toward NO"
            : avgSportsNo > 0
              ? "within tolerance"
              : "—"
        }
        loading={loadingRes}
      />
      <KPICard
        label="Top spread today"
        value={topDivergence}
        format="percent"
        hint="poly vs kalshi"
        loading={loadingScores}
      />
      <KPICard
        label="Inefficiencies flagged"
        value={flaggedCount}
        hint="refreshes every 5m"
        loading={loadingScores}
      />
    </div>
  );
}
