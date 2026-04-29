"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { cn } from "@/lib/cn";
import { yesOutcome, usd } from "@/lib/utils";
import type { ExchangeFilter, UnifiedMarket } from "@/lib/types";

const CATEGORIES = ["All", "Sports", "Politics", "Crypto", "Finance", "Other"];
const VENUES: Array<{ id: ExchangeFilter; label: string }> = [
  { id: "all", label: "All venues" },
  { id: "polymarket", label: "Polymarket" },
  { id: "kalshi", label: "Kalshi" },
];
const TOP_N = 20;
const BIG_MOVE = 0.1; // 10pp threshold for "late-information event" callout

interface Mover {
  market: UnifiedMarket;
  yes: number;
  change: number; // priceChange24h in [-1, 1]
  abs: number;
}

function momentumColor(change: number): string {
  return change >= 0 ? "#10b981" : "#ef4444";
}

/**
 * Chart A — "Which markets are moving fast right now, and in what direction?"
 *
 * A horizontal diverging bar chart: positive movers shoot right (green,
 * rising toward YES), negative movers shoot left (red, falling toward NO).
 * Bar width encodes |priceChange24h|. We surface the N markets with the
 * largest absolute move and annotate any > 10pp moves as possible
 * late-information events (the typical fingerprint of news hitting one
 * venue before the other).
 */
export function MarketMomentum() {
  const [venue, setVenue] = useState<ExchangeFilter>("all");
  const [category, setCategory] = useState<string>("All");

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (venue !== "all") qs.set("exchange", venue);
    if (category !== "All") qs.set("category", category);
    qs.set("limit", "500");
    return `/api/markets?${qs.toString()}`;
  }, [venue, category]);

  const { data, isLoading } = useSWR<ApiPayload<UnifiedMarket[]>>(
    url,
    fetcher,
    {
      refreshInterval: REFRESH.live,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const movers = useMemo<Mover[]>(() => {
    const list: Mover[] = [];
    for (const m of data?.data ?? []) {
      const yes = yesOutcome(m);
      if (!yes) continue;
      const change = yes.priceChange24h;
      if (typeof change !== "number" || !Number.isFinite(change)) continue;
      if (change === 0) continue;
      list.push({ market: m, yes: yes.price, change, abs: Math.abs(change) });
    }
    return list.sort((a, b) => b.abs - a.abs).slice(0, TOP_N);
  }, [data?.data]);

  const maxAbs = Math.max(...movers.map((m) => m.abs), 0.05);
  const bigMoveCount = useMemo(
    () => (data?.data ?? []).reduce((n, m) => {
      const y = yesOutcome(m);
      return n + (y && Math.abs(y.priceChange24h ?? 0) >= BIG_MOVE ? 1 : 0);
    }, 0),
    [data?.data],
  );

  return (
    <Card>
      <CardHeader
        title="Market momentum"
        subtitle={
          movers.length === 0
            ? "No 24h movement data available"
            : `Top ${movers.length} movers · ${bigMoveCount} markets > ${BIG_MOVE * 100}pp in 24h`
        }
        right={
          <div className="flex items-center gap-2">
            <select
              value={venue}
              onChange={(e) => setVenue(e.target.value as ExchangeFilter)}
              className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs"
            >
              {VENUES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
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
      <CardBody className="px-5 py-4">
        {isLoading && !data ? (
          <ChartSkeleton />
        ) : movers.length === 0 ? (
          <div className="flex h-60 items-center justify-center text-sm text-fg-muted">
            No 24h movers found in this slice. Try another venue or category.
          </div>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-[1fr_1fr] text-[10px] font-medium uppercase tracking-wider text-fg-muted">
              <span className="text-right">↓ Falling (NO)</span>
              <span>Rising (YES) ↑</span>
            </div>
            <div className="flex flex-col gap-1">
              {movers.map((m) => (
                <MomentumRow key={m.market.marketId} mover={m} max={maxAbs} />
              ))}
            </div>
            {bigMoveCount >= 3 && (
              <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                <span className="font-semibold">
                  {bigMoveCount} markets moved &gt; {BIG_MOVE * 100}pp in 24h
                </span>
                <span className="ml-1 text-warning/80">
                  — possible late-information events worth cross-checking on
                  the other venue.
                </span>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function MomentumRow({ mover, max }: { mover: Mover; max: number }) {
  const color = momentumColor(mover.change);
  const rising = mover.change >= 0;
  const widthPct = Math.max(4, (mover.abs / max) * 100);
  const changePP = (mover.change * 100).toFixed(1);
  const big = mover.abs >= BIG_MOVE;

  return (
    <div className="rounded-md border border-transparent px-1 py-1 hover:border-border-subtle hover:bg-bg-elev/40">
      <div className="grid grid-cols-[1fr_220px_1fr] items-center gap-2">
        {/* Left (negative) bar track */}
        <div className="relative flex h-3 items-center justify-end overflow-hidden rounded-sm bg-bg-elev/50">
          {!rising && (
            <div
              className="h-full rounded-l-sm"
              style={{ width: `${widthPct}%`, background: color }}
            />
          )}
          {!rising && (
            <span
              className="absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[9px] font-semibold"
              style={{ color }}
            >
              {changePP}pp
            </span>
          )}
        </div>

        {/* Centre label */}
        <div className="flex flex-col items-center px-2 text-center">
          <span
            className="max-w-[220px] truncate text-[11px] font-medium text-fg"
            title={mover.market.title}
          >
            {mover.market.title}
          </span>
          <span className="text-[9px] text-fg-subtle">
            <span className="capitalize">{mover.market.exchange}</span> · YES{" "}
            {(mover.yes * 100).toFixed(0)}% · vol {usd(mover.market.volume24h)}
          </span>
        </div>

        {/* Right (positive) bar track */}
        <div className="relative flex h-3 items-center overflow-hidden rounded-sm bg-bg-elev/50">
          {rising && (
            <div
              className="h-full rounded-r-sm"
              style={{ width: `${widthPct}%`, background: color }}
            />
          )}
          {rising && (
            <span
              className="absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[9px] font-semibold"
              style={{ color }}
            >
              +{changePP}pp
            </span>
          )}
        </div>
      </div>
      {big && (
        <div
          className={cn(
            "mt-0.5 text-center font-mono text-[9px] uppercase tracking-wider",
          )}
          style={{ color }}
        >
          ⚡ big move
        </div>
      )}
    </div>
  );
}
