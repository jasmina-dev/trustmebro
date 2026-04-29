"use client";

import useSWR from "swr";
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { usd } from "@/lib/utils";
import type { EfficiencyMonth } from "@/lib/types";

/**
 * Chart C — Volume-weighted efficiency timeline.
 *
 * Area chart: X = month (YYYY-MM), Y = volume-weighted mean mispricing
 * (% absolute error between final YES price and resolution). Two series
 * (Polymarket / Kalshi), stacked in separate colors with 40% fill. We
 * also fit a 3-month linear trend to the most recent months per venue
 * and surface it as a small "improving / worsening" chip.
 */
export function EfficiencyTimeline() {
  const { data, isLoading } = useSWR<ApiPayload<EfficiencyMonth[]>>(
    "/api/efficiency-timeline",
    fetcher,
    {
      refreshInterval: REFRESH.resolution,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const series = useMemo(() => data?.data ?? [], [data?.data]);
  const trends = useMemo(() => computeTrends(series), [series]);
  const totalVolume = useMemo(
    () =>
      series.reduce(
        (s, row) => s + (row.polymarketVolume ?? 0) + (row.kalshiVolume ?? 0),
        0,
      ),
    [series],
  );

  return (
    <Card>
      <CardHeader
        title="Efficiency over time"
        subtitle={
          series.length === 0
            ? "No resolution history available"
            : `Volume-weighted mispricing by resolution month · ${series.length} months · ${usd(totalVolume)} analyzed`
        }
      />
      <CardBody className="h-[320px] pl-0 pr-3">
        {isLoading && !data ? (
          <ChartSkeleton />
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            Not enough resolved markets with recorded resolution dates.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={series}
              margin={{ top: 12, right: 12, bottom: 16, left: 32 }}
            >
              <defs>
                <linearGradient id="polyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2d9cdb" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2d9cdb" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="kalshiFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2330" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#8b91a1", fontSize: 10 }}
                axisLine={{ stroke: "#2a2f3d" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#8b91a1", fontSize: 10 }}
                axisLine={{ stroke: "#2a2f3d" }}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                label={{
                  value: "Mispricing (weighted)",
                  fill: "#8b91a1",
                  fontSize: 11,
                  angle: -90,
                  position: "insideLeft",
                  offset: -4,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "#111318",
                  border: "1px solid #2a2f3d",
                  borderRadius: 8,
                }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as EfficiencyMonth;
                  return (
                    <div className="rounded-lg border border-border bg-bg-card p-3 text-xs shadow-xl">
                      <div className="mb-1 font-semibold text-fg">{label}</div>
                      <div className="space-y-0.5 font-mono text-fg-muted">
                        {row.polymarket !== undefined && (
                          <div>
                            <span style={{ color: "#2d9cdb" }}>Polymarket</span>{" "}
                            {row.polymarket}% · n={row.polymarketN ?? 0} ·{" "}
                            {usd(row.polymarketVolume ?? 0)}
                          </div>
                        )}
                        {row.kalshi !== undefined && (
                          <div>
                            <span style={{ color: "#10b981" }}>Kalshi</span>{" "}
                            {row.kalshi}% · n={row.kalshiN ?? 0} ·{" "}
                            {usd(row.kalshiVolume ?? 0)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="polymarket"
                name="Polymarket"
                stroke="#2d9cdb"
                strokeWidth={2}
                fill="url(#polyFill)"
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="kalshi"
                name="Kalshi"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#kalshiFill)"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardBody>
      {trends.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border-subtle px-5 py-3 text-[11px]">
          {trends.map((t) => (
            <TrendPill key={t.venue} {...t} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Trend analysis — 3-month linear regression of the most recent values.
// A negative slope means mispricing is shrinking → "improving".
// ---------------------------------------------------------------------------

interface TrendChip {
  venue: "polymarket" | "kalshi";
  direction: "improving" | "worsening" | "flat";
  slopePP: number;
}

function computeTrends(series: EfficiencyMonth[]): TrendChip[] {
  const chips: TrendChip[] = [];
  for (const venue of ["polymarket", "kalshi"] as const) {
    const recent = series
      .slice(-3)
      .map((row, i) => ({ i, v: row[venue] }))
      .filter((p): p is { i: number; v: number } =>
        typeof p.v === "number",
      );
    if (recent.length < 2) continue;

    const n = recent.length;
    const xMean = recent.reduce((s, p) => s + p.i, 0) / n;
    const yMean = recent.reduce((s, p) => s + p.v, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of recent) {
      num += (p.i - xMean) * (p.v - yMean);
      den += (p.i - xMean) * (p.i - xMean);
    }
    const slope = den === 0 ? 0 : num / den;
    const direction: TrendChip["direction"] =
      Math.abs(slope) < 0.25 ? "flat" : slope < 0 ? "improving" : "worsening";
    chips.push({
      venue,
      direction,
      slopePP: Math.round(slope * 10) / 10,
    });
  }
  return chips;
}

function TrendPill({ venue, direction, slopePP }: TrendChip) {
  const venueColor = venue === "polymarket" ? "#2d9cdb" : "#10b981";
  const { color, bg, icon, label } = (
    {
      improving: {
        color: "#10b981",
        bg: "#10b98122",
        icon: "↓",
        label: "improving",
      },
      worsening: {
        color: "#ef4444",
        bg: "#ef444422",
        icon: "↑",
        label: "worsening",
      },
      flat: {
        color: "#8b91a1",
        bg: "#8b91a122",
        icon: "→",
        label: "flat",
      },
    } as const
  )[direction];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono"
      style={{ background: bg, color }}
    >
      <span className="font-semibold capitalize" style={{ color: venueColor }}>
        {venue}
      </span>
      <span>{icon}</span>
      <span>{label}</span>
      <span className="text-fg-muted">
        ({slopePP >= 0 ? "+" : ""}
        {slopePP.toFixed(1)}pp / mo)
      </span>
    </span>
  );
}
