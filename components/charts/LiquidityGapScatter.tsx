"use client";

import useSWR from "swr";
import { useEffect, useMemo } from "react";
import {
  CartesianGrid,
  Legend,
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
import { useState } from "react";
import type {
  InefficiencyScore,
  UnifiedMarket,
} from "@/lib/types";
import { usd } from "@/lib/utils";

export function LiquidityGapScatter() {
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

  const { data: markets } = useSWR<ApiPayload<UnifiedMarket[]>>(
    marketsUrl,
    fetcher,
    { refreshInterval: REFRESH.live, ...swrOpts },
  );
  const { data: scores } = useSWR<ApiPayload<InefficiencyScore[]>>(
    "/api/inefficiencies",
    fetcher,
    { refreshInterval: REFRESH.inefficiencies, ...swrOpts },
  );

  const [selected, setSelected] = useState<UnifiedMarket | null>(null);

  const scoreById = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scores?.data ?? []) map.set(s.marketId, s.score);
    return map;
  }, [scores?.data]);

  const { polyPoints, kalshiPoints } = useMemo(() => {
    const poly: Array<{
      x: number;
      y: number;
      z: number;
      m: UnifiedMarket;
    }> = [];
    const kalshi: typeof poly = [];

    for (const m of markets?.data ?? []) {
      if (m.volume24h <= 0 || m.liquidity <= 0) continue;
      const point = {
        x: m.volume24h,
        y: m.liquidity,
        z: scoreById.get(m.marketId) ?? 20,
        m,
      };
      if (m.exchange === "kalshi") kalshi.push(point);
      else poly.push(point);
    }
    return { polyPoints: poly, kalshiPoints: kalshi };
  }, [markets?.data, scoreById]);

  if (!markets) {
    return (
      <Card>
        <CardHeader title="Liquidity gap scatter" />
        <ChartSkeleton />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Liquidity gap scatter"
        subtitle="Volume vs liquidity depth. Dot size = inefficiency score."
        right={
          <span className="rounded-md border border-border bg-bg-elev px-2 py-0.5 font-mono text-[10px] text-fg-muted">
            {markets?.cache ?? "…"}
          </span>
        }
      />
      <CardBody className="h-[320px] pl-0 pr-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 12, bottom: 28, left: 36 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2330" />
            <XAxis
              type="number"
              dataKey="x"
              name="volume24h"
              scale="log"
              domain={["auto", "auto"]}
              tick={{ fill: "#8b91a1", fontSize: 10 }}
              tickFormatter={(v) => usd(v)}
              axisLine={{ stroke: "#2a2f3d" }}
              tickLine={false}
              label={{
                value: "24h volume (log)",
                fill: "#8b91a1",
                fontSize: 11,
                position: "insideBottom",
                offset: -8,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="liquidity"
              scale="log"
              domain={["auto", "auto"]}
              tick={{ fill: "#8b91a1", fontSize: 10 }}
              tickFormatter={(v) => usd(v)}
              axisLine={{ stroke: "#2a2f3d" }}
              tickLine={false}
              label={{
                value: "Liquidity (log)",
                fill: "#8b91a1",
                fontSize: 11,
                angle: -90,
                position: "insideLeft",
                offset: 12,
              }}
            />
            <ZAxis type="number" dataKey="z" range={[20, 400]} name="score" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { m: UnifiedMarket; z: number };
                return (
                  <div className="max-w-xs rounded-lg border border-border bg-bg-card p-3 text-xs shadow-xl">
                    <div className="mb-1 font-semibold text-fg">
                      {d.m.title}
                    </div>
                    <div className="space-y-0.5 text-fg-muted">
                      <div>
                        Venue: <span className="capitalize text-fg">{d.m.exchange}</span>
                      </div>
                      <div>Vol: {usd(d.m.volume24h)}</div>
                      <div>Liq: {usd(d.m.liquidity)}</div>
                      <div>
                        Score: <span className="text-fg">{d.z.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Scatter
              name="Polymarket"
              data={polyPoints}
              fill="#2d9cdb"
              fillOpacity={0.75}
              onClick={(p) => setSelected((p as any).m)}
            />
            <Scatter
              name="Kalshi"
              data={kalshiPoints}
              fill="#10b981"
              fillOpacity={0.75}
              onClick={(p) => setSelected((p as any).m)}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </CardBody>
      {selected && (
        <div className="border-t border-border-subtle bg-bg-elev/60 px-5 py-3 text-xs">
          <div className="font-semibold">{selected.title}</div>
          <div className="mt-1 flex gap-4 text-fg-muted">
            <span className="capitalize">{selected.exchange}</span>
            <span>Vol {usd(selected.volume24h)}</span>
            <span>Liq {usd(selected.liquidity)}</span>
            <button
              onClick={() => setSelected(null)}
              className="ml-auto text-fg-muted hover:text-fg"
            >
              close
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
