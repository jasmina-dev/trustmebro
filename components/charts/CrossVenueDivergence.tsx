"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { useDashboard } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { DivergentPair } from "@/lib/types";

const CATEGORY_OPTIONS = [
  "All",
  "Sports",
  "Politics",
  "Crypto",
  "Finance",
  "Other",
] as const;
type CategoryOpt = (typeof CATEGORY_OPTIONS)[number];

/**
 * Color scale for the spread magnitude.
 *   < 2pp   green (below the flag threshold — shown only in scatter context)
 *   2–5pp   amber
 *   ≥ 5pp   red
 */
function spreadColor(pp: number): string {
  if (pp < 2) return "#10b981";
  if (pp < 5) return "#f59e0b";
  return "#ef4444";
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export function CrossVenueDivergence() {
  const [category, setCategory] = useState<CategoryOpt>("All");

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (category !== "All") qs.set("category", category);
    qs.set("limit", "100");
    return `/api/divergence?${qs.toString()}`;
  }, [category]);

  const { data, isLoading } = useSWR<ApiPayload<DivergentPair[]>>(url, fetcher, {
    refreshInterval: REFRESH.inefficiencies,
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const pairs = useMemo(() => data?.data ?? [], [data?.data]);
  const topPairs = useMemo(() => pairs.slice(0, 15), [pairs]);

  // Surface the top pair into global context so the chatbot has a clear
  // answer when someone asks "what's the biggest spread right now?".
  const updateChartContext = useDashboard((s) => s.updateChartContext);
  useEffect(() => {
    if (pairs.length === 0) return;
    updateChartContext("cross-venue-divergence", {
      inefficiencyScores: pairs.slice(0, 20).map((p) => ({
        id: `div-${p.pairId}`,
        marketId: p.polyMarketId,
        title: p.polyTitle,
        exchange: "polymarket",
        category: p.category,
        type: "cross_venue_divergence",
        score: Math.min(100, Math.round(p.spread * 1000)),
        details: `Poly YES ${(p.polyYes * 100).toFixed(1)}% vs Kalshi YES ${(p.kalshiYes * 100).toFixed(1)}% (Δ ${p.spreadPP}pp)`,
        counterpartyMarketId: p.kalshiMarketId,
        counterpartyExchange: "kalshi",
        spread: p.spread,
        lastUpdated: new Date().toISOString(),
      })),
    });
  }, [pairs, updateChartContext]);

  const meta = data?.meta as
    | { totalPairs?: number; threshold?: number }
    | undefined;
  const threshold = meta?.threshold ?? 0.02;

  return (
    <Card>
      <CardHeader
        title="Cross-venue divergence"
        subtitle={
          pairs.length === 0
            ? `No pairs above ${(threshold * 100).toFixed(0)}pp`
            : `${pairs.length} matched pairs · top ${topPairs.length} shown · threshold ${(threshold * 100).toFixed(0)}pp`
        }
        right={
          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryOpt)}
              className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs"
            >
              {CATEGORY_OPTIONS.map((c) => (
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
      <CardBody className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {isLoading && !data ? (
          <div className="lg:col-span-2">
            <ChartSkeleton />
          </div>
        ) : pairs.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-fg-muted lg:col-span-2">
            No markets currently exceed the {(threshold * 100).toFixed(0)}pp
            cross-venue spread threshold.
          </div>
        ) : (
          <>
            <RankedList pairs={topPairs} />
            <AgreementScatter pairs={pairs} />
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ranked list — horizontal bar per pair showing poly + kalshi prices and
// the absolute spread. Row width encodes spread magnitude.
// ---------------------------------------------------------------------------

function RankedList({ pairs }: { pairs: DivergentPair[] }) {
  const maxSpread = Math.max(...pairs.map((p) => p.spread), 0.05);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-muted">
        Top matches by spread
      </div>
      <div className="flex flex-col gap-1.5">
        {pairs.map((p) => (
          <PairRow key={p.pairId} pair={p} maxSpread={maxSpread} />
        ))}
      </div>
    </div>
  );
}

function PairRow({
  pair,
  maxSpread,
}: {
  pair: DivergentPair;
  maxSpread: number;
}) {
  const color = spreadColor(pair.spreadPP);
  const width = Math.max(6, (pair.spread / maxSpread) * 100);
  return (
    <div className="rounded-md border border-border-subtle bg-bg-elev/60 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-xs font-medium text-fg"
            title={`Poly: ${pair.polyTitle}\nKalshi: ${pair.kalshiTitle}`}
          >
            {truncate(pair.polyTitle, 56)}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-fg-muted">
            <span>
              Poly <span className="text-fg">{(pair.polyYes * 100).toFixed(0)}%</span>
            </span>
            <span>
              Kalshi{" "}
              <span className="text-fg">
                {(pair.kalshiYes * 100).toFixed(0)}%
              </span>
            </span>
            <span>sim {(pair.similarityScore * 100).toFixed(0)}%</span>
            <span
              className={cn(
                "uppercase tracking-wide",
                pair.arbitrageDirection === "buy_kalshi"
                  ? "text-info"
                  : "text-accent",
              )}
            >
              {pair.arbitrageDirection === "buy_kalshi"
                ? "buy kalshi"
                : "buy poly"}
            </span>
          </div>
        </div>
        <div
          className="shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-xs font-semibold"
          style={{ color, background: `${color}22` }}
        >
          {pair.spreadPP.toFixed(1)}pp
        </div>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-card">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scatter — every matched pair plotted (Poly YES, Kalshi YES).
// Diagonal y=x line marks perfect price agreement.
// ---------------------------------------------------------------------------

function AgreementScatter({ pairs }: { pairs: DivergentPair[] }) {
  const points = useMemo(
    () =>
      pairs.map((p) => ({
        x: p.polyYes * 100,
        y: p.kalshiYes * 100,
        z: Math.max(8, p.spreadPP * 8),
        color: spreadColor(p.spreadPP),
        pair: p,
      })),
    [pairs],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-muted">
        Price agreement (diagonal = perfect)
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2330" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              name="Polymarket YES"
              tick={{ fill: "#8b91a1", fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
              axisLine={{ stroke: "#2a2f3d" }}
              tickLine={false}
              label={{
                value: "Polymarket YES",
                fill: "#8b91a1",
                fontSize: 11,
                position: "insideBottom",
                offset: -8,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              name="Kalshi YES"
              tick={{ fill: "#8b91a1", fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
              axisLine={{ stroke: "#2a2f3d" }}
              tickLine={false}
              label={{
                value: "Kalshi YES",
                fill: "#8b91a1",
                fontSize: 11,
                angle: -90,
                position: "insideLeft",
                offset: 12,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[40, 320]} />
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
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { pair: DivergentPair };
                return (
                  <div className="max-w-xs rounded-lg border border-border bg-bg-card p-3 text-xs shadow-xl">
                    <div className="mb-1 font-semibold text-fg">
                      {truncate(p.pair.polyTitle, 56)}
                    </div>
                    <div className="space-y-0.5 font-mono text-fg-muted">
                      <div>
                        Poly YES{" "}
                        <span className="text-fg">
                          {(p.pair.polyYes * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        Kalshi YES{" "}
                        <span className="text-fg">
                          {(p.pair.kalshiYes * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        Spread{" "}
                        <span className="text-fg">
                          {p.pair.spreadPP.toFixed(1)}pp
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Scatter
              data={points}
              shape={(props: {
                cx?: number;
                cy?: number;
                payload?: { color?: string; z?: number };
              }) => {
                const { cx = 0, cy = 0, payload } = props;
                const color = payload?.color ?? "#6366f1";
                const r = Math.sqrt((payload?.z ?? 40) / Math.PI);
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={color}
                    fillOpacity={0.75}
                    stroke={color}
                    strokeWidth={1}
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-fg-muted">
        <LegendDot color="#10b981" label="< 2pp" />
        <LegendDot color="#f59e0b" label="2–5pp" />
        <LegendDot color="#ef4444" label="≥ 5pp" />
        <span className="ml-auto">
          above diagonal → Kalshi over · below → Poly over
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
