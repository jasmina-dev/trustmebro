"use client";

import useSWR from "swr";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
  Legend,
} from "recharts";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { histogram, mean, normalPdf, stddev } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { useDashboard } from "@/lib/store";
import type { ResolutionBiasBucket } from "@/lib/types";

export function ResolutionBiasDistribution() {
  const { activeCategory } = useDashboard();

  const { data, isLoading } = useSWR<ApiPayload<ResolutionBiasBucket[]>>(
    activeCategory === "All"
      ? "/api/resolution-bias"
      : `/api/resolution-bias?category=${encodeURIComponent(activeCategory)}`,
    fetcher,
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
      <Card>
        <CardHeader title="Resolution-rate distribution" />
        <ChartSkeleton />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Resolution-rate distribution"
        subtitle={`NO-rate histogram across all closed markets${activeCategory !== "All" ? ` in ${activeCategory}` : ""}. Normal(μ=${(mu * 100).toFixed(0)}%, σ=${(sigma * 100).toFixed(1)}%) overlay.`}
        right={
          <span className="rounded-md border border-border bg-bg-elev px-2 py-0.5 font-mono text-[10px] text-fg-muted">
            {data?.cache ?? "…"}
          </span>
        }
      />
      <CardBody className="h-[300px] pl-2 pr-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={histogramData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2330" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#8b91a1", fontSize: 10 }}
              interval={2}
              axisLine={{ stroke: "#2a2f3d" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#8b91a1", fontSize: 10 }}
              axisLine={{ stroke: "#2a2f3d" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#111318",
                border: "1px solid #2a2f3d",
                borderRadius: 8,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="count" name="Markets" radius={[4, 4, 0, 0]}>
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
      </CardBody>
    </Card>
  );
}
