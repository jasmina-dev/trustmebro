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

  // ---------- Derived metrics ----------
  const totalMarkets = markets?.data?.length ?? 0;

  // Filter inefficiency scores to the active venue.
  // cross_venue_divergence spans both exchanges, so always include it.
  const filteredScores = useMemo(() => {
    if (!scores?.data) return [];
    if (activeVenue === "all") return scores.data;
    return scores.data.filter(
      (s) => s.type === "cross_venue_divergence" || s.exchange === activeVenue,
    );
  }, [scores?.data, activeVenue]);

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
    if (filteredScores.length > 0) {
      updateChartContext("overview", {
        inefficiencyScores: filteredScores,
      });
    }
  }, [filteredScores, updateChartContext]);

  useEffect(() => {
    if (resolutionStats) {
      updateChartContext("overview", { resolutionStats });
    }
  }, [resolutionStats, updateChartContext]);

  const avgPoliticsNo = useMemo(() => {
    if (!resolution?.data) return 0;
    const politics = resolution.data.filter((b) => b.category === "Politics");
    if (politics.length === 0) return 0;
    const totals = politics.reduce(
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
    const divs = filteredScores.filter(
      (s) => s.type === "cross_venue_divergence" && typeof s.spread === "number",
    );
    if (divs.length === 0) return 0;
    return Math.max(...divs.map((d) => d.spread ?? 0));
  }, [filteredScores]);

  const flaggedCount = filteredScores.length;

  return (
    <div className="grid grid-cols-1 gap-x-tmb7 gap-y-tmb6 sm:grid-cols-2 xl:grid-cols-4">
      <KPICard
        label="Markets analyzed"
        value={totalMarkets}

        loading={loadingMarkets}
      />
      <KPICard
        label="Avg politics NO-rate"
        value={avgPoliticsNo}
        format="percent"
        hint={
          avgPoliticsNo > 0.55
            ? "biased toward NO"
            : avgPoliticsNo > 0
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
