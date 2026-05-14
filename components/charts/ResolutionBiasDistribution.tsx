"use client";

import useSWR from "swr";
import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { REFRESH, resolutionBiasFetcher, type ApiPayload } from "@/lib/api";
import { histogram, mean, normalPdf, stddev } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { HelpTooltip } from "../ui/HelpTooltip";
import { useDashboard } from "@/lib/store";
import { chartAxisTick, chartTooltipContentStyle } from "@/lib/chartTypography";
import type { ResolutionBiasBucket } from "@/lib/types";

/**
 * Resolution-bias distribution chart.
 *
 * @remarks
 * Visualizes the distribution of NO-rate bias across buckets returned by
 * `/api/resolution-bias`, filtered by the active dashboard category.
 */
export function ResolutionBiasDistribution() {
  const { activeCategory } = useDashboard();

  const { data, isLoading } = useSWR<ApiPayload<ResolutionBiasBucket[]>>(
    activeCategory === "All"
      ? "/api/resolution-bias"
      : `/api/resolution-bias?category=${encodeURIComponent(activeCategory)}`,
    resolutionBiasFetcher,
    {
      refreshInterval: REFRESH.resolution,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const { histogramData, mu, sigma, peak } = useMemo(() => {
    const buckets = data?.data ?? [];
    const rates = buckets
      .filter((b) => b.total > 0)
      .flatMap((b) =>
        // For each bucket we synthesize its NO rate that many times so the
        // histogram weighs categories by their sample size.
        Array.from({ length: Math.min(b.total, 500) }, () => b.noRate),
      );
    if (rates.length === 0) {
      return { histogramData: [], mu: 0.5, sigma: 0.1, peak: 0 };
    }

    const bins = histogram(rates, { bins: 20, min: 0, max: 1 });
    const mu = mean(rates);
    const sigma = Math.max(0.05, stddev(rates));

    // Overlay normal PDF rescaled to the histogram's peak.
    const peak = Math.max(...bins.map((b) => b.count));
    const overlay = bins.map((b) => {
      const x = (b.bucketStart + b.bucketEnd) / 2;
      const pdf = normalPdf(x, mu, sigma);
      const normalized = pdf / normalPdf(mu, mu, sigma);
      return { ...b, normal: normalized * peak };
    });

    return { histogramData: overlay, mu, sigma, peak };
  }, [data?.data]);

  if (isLoading && !data) {
    return (
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader title="Resolution-rate distribution" />
        <ChartSkeleton hint="Sharing the resolution-bias crawl — appears as soon as the heatmap finishes its closed-market scan." />
      </Card>
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader
        title="Resolution-rate distribution"
        subtitle={`NO-rate histogram across all closed markets${activeCategory !== "All" ? ` in ${activeCategory}` : ""}. Normal(μ=${(mu * 100).toFixed(0)}%, σ=${(sigma * 100).toFixed(1)}%) overlay.`}
        right={
          <HelpTooltip content="Bars show how frequently NO-resolution rates appear across buckets. The overlaid curve is a normal-fit reference to help you see skew and fat tails." />
        }
      />
      <CardBody className="flex flex-col gap-2 pl-2 pr-4 pb-3">
        <div className="h-[280px] w-full min-h-0 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={histogramData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1f2330"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={chartAxisTick}
                interval={2}
                axisLine={{ stroke: "#2a2f3d" }}
                tickLine={false}
              />
              <YAxis
                tick={chartAxisTick}
                axisLine={{ stroke: "#2a2f3d" }}
                tickLine={false}
              />
              <Tooltip contentStyle={chartTooltipContentStyle} />
              <Bar dataKey="count" name="Count per bin" radius={[4, 4, 0, 0]}>
                {histogramData.map((b, i) => (
                  <Cell
                    key={i}
                    fill={b.bucketStart >= 0.65 ? "#ef4444" : "#6366f1"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="normal"
                name="Normal(μ,σ)"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-subtle pt-2 text-[10px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-4 shrink-0 rounded-sm bg-[#6366f1]/85"
              aria-hidden
            />
            Bin starts below 65% NO-rate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-4 shrink-0 rounded-sm bg-[#ef4444]/85"
              aria-hidden
            />
            Bin starts at or above 65% NO-rate (strong NO-skew band)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5 shrink-0 rounded-full bg-[#22c55e]"
              aria-hidden
            />
            Normal fit curve (μ, σ)
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
