"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import type { CalibrationSeries } from "@/lib/types";

const CATEGORIES = ["All", "Sports", "Politics", "Crypto", "Finance", "Other"];
const VENUE_COLOR: Record<string, string> = {
  polymarket: "#2d9cdb",
  kalshi: "#10b981",
};

/**
 * Chart B — "Do markets resolve accurately when the price is stable vs
 * volatile?"
 *
 * Scatter / line hybrid calibration curve. X = final YES price bucketed
 * into deciles (0–10%, 10–20%, ..., 90–100%). Y = actual YES resolution
 * rate in that bucket. Perfect calibration = the 45° diagonal.
 *
 * We render one line per venue, with dot radius encoding the bucket's
 * sample size. Buckets with zero observations are skipped so the lines
 * don't snap to (0, 0). A category selector swaps the visible slice.
 *
 * Interpretation:
 *   above the diagonal → bucket was *underpriced* (markets paid <x%
 *     for YES but resolved YES more than x% of the time)
 *   below the diagonal → bucket was *overpriced*
 */
export function CalibrationCurve() {
  const [category, setCategory] = useState<string>("All");

  const { data, isLoading } = useSWR<ApiPayload<CalibrationSeries[]>>(
    "/api/calibration",
    fetcher,
    {
      refreshInterval: REFRESH.resolution,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const filtered = useMemo(() => {
    const all = data?.data ?? [];
    if (category === "All") {
      // Combine buckets across categories per venue.
      const byVenue = new Map<string, CalibrationSeries>();
      for (const s of all) {
        const existing = byVenue.get(s.exchange);
        if (!existing) {
          byVenue.set(s.exchange, {
            exchange: s.exchange,
            category: "All",
            totalMarkets: s.totalMarkets,
            buckets: s.buckets.map((b) => ({ ...b })),
          });
          continue;
        }
        existing.totalMarkets += s.totalMarkets;
        for (let i = 0; i < existing.buckets.length; i++) {
          const a = existing.buckets[i];
          const b = s.buckets[i];
          const nTotal = a.count + b.count;
          if (nTotal === 0) continue;
          a.meanPrice =
            (a.meanPrice * a.count + b.meanPrice * b.count) / nTotal;
          a.resolutionRate =
            (a.resolutionRate * a.count + b.resolutionRate * b.count) / nTotal;
          a.count = nTotal;
        }
      }
      return Array.from(byVenue.values());
    }
    return all.filter((s) => s.category === category);
  }, [data?.data, category]);

  const chartData = useMemo(() => {
    const rows: Array<{
      meanPrice: number;
      polymarket?: number;
      kalshi?: number;
      polymarketN?: number;
      kalshiN?: number;
    }> = [];

    for (const series of filtered) {
      for (const b of series.buckets) {
        if (b.count === 0) continue;
        const xPct = Math.round(b.meanPrice * 1000) / 10;
        const yPct = Math.round(b.resolutionRate * 1000) / 10;
        rows.push({
          meanPrice: xPct,
          [series.exchange]: yPct,
          [`${series.exchange}N`]: b.count,
        } as (typeof rows)[number]);
      }
    }
    return rows.sort((a, b) => a.meanPrice - b.meanPrice);
  }, [filtered]);

  const totalObservations = filtered.reduce(
    (s, ser) => s + ser.totalMarkets,
    0,
  );

  return (
    <Card>
      <CardHeader
        title="Calibration curve"
        subtitle={
          totalObservations === 0
            ? "No resolved markets available"
            : `${totalObservations.toLocaleString()} resolved markets · bucket = decile of final YES price · diagonal = perfect calibration`
        }
        right={
          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="rounded-md border border-border bg-bg-elev px-2 py-0.5 font-mono text-[10px] text-fg-muted">
              {data?.cache ?? "…"}
            </span>
          </div>
        }
      />
      <CardBody className="h-[380px] pl-1 pr-3">
        {isLoading && !data ? (
          <ChartSkeleton />
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            No resolved markets matched this slice.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 16, right: 16, bottom: 36, left: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2330" />
              <XAxis
                type="number"
                dataKey="meanPrice"
                domain={[0, 100]}
                ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                tick={{ fill: "#8b91a1", fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                axisLine={{ stroke: "#2a2f3d" }}
                tickLine={false}
                label={{
                  value: "Final YES price (decile mean)",
                  fill: "#8b91a1",
                  fontSize: 11,
                  position: "insideBottom",
                  offset: -12,
                }}
              />
              <YAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "#8b91a1", fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                axisLine={{ stroke: "#2a2f3d" }}
                tickLine={false}
                label={{
                  value: "Actual YES resolution rate",
                  fill: "#8b91a1",
                  fontSize: 11,
                  angle: -90,
                  position: "insideLeft",
                  offset: -2,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "#111318",
                  border: "1px solid #2a2f3d",
                  borderRadius: 8,
                }}
                formatter={(value: number, key: string) => {
                  if (key === "polymarket" || key === "kalshi") {
                    return [`${value}%`, key];
                  }
                  return [value, key];
                }}
                labelFormatter={(label) => `Price ≈ ${label}%`}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                payload={[
                  {
                    value: "Perfect calibration",
                    type: "line",
                    color: "#6366f1",
                  },
                  {
                    value: "Polymarket",
                    type: "line",
                    color: VENUE_COLOR.polymarket,
                  },
                  { value: "Kalshi", type: "line", color: VENUE_COLOR.kalshi },
                ]}
              />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 100, y: 100 },
                ]}
                stroke="#6366f1"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
              <Line
                type="monotone"
                dataKey="polymarket"
                stroke={VENUE_COLOR.polymarket}
                strokeWidth={2}
                connectNulls
                dot={{ r: 4, stroke: VENUE_COLOR.polymarket, fill: "#0b0d12" }}
                activeDot={{ r: 6 }}
                name="Polymarket"
              />
              <Line
                type="monotone"
                dataKey="kalshi"
                stroke={VENUE_COLOR.kalshi}
                strokeWidth={2}
                connectNulls
                dot={{ r: 4, stroke: VENUE_COLOR.kalshi, fill: "#0b0d12" }}
                activeDot={{ r: 6 }}
                name="Kalshi"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardBody>
      <div className="border-t border-border-subtle px-5 pb-3 pt-2 text-[10px] leading-relaxed text-fg-subtle">
        <span className="font-semibold text-fg-muted">Reading this chart:</span>{" "}
        points <em>above</em> the diagonal indicate the market underpriced YES
        in that bucket (actual rate &gt; implied probability); points{" "}
        <em>below</em> indicate YES was overpriced. A venue hugging the
        diagonal is well-calibrated.
      </div>
    </Card>
  );
}
