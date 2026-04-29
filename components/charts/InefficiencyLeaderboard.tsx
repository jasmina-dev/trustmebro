"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { cn } from "@/lib/cn";
import { useDashboard } from "@/lib/store";
import type { InefficiencyScore, InefficiencyType } from "@/lib/types";

const TYPE_LABEL: Record<InefficiencyType, string> = {
  resolution_bias: "Bias",
  cross_venue_divergence: "Divergence",
  liquidity_gap: "Liquidity",
  late_breaking_mismatch: "Late-break",
};

const TYPE_COLOR: Record<InefficiencyType, string> = {
  resolution_bias: "bg-danger/20 text-danger border-danger/30",
  cross_venue_divergence: "bg-accent/20 text-accent-hover border-accent/30",
  liquidity_gap: "bg-warning/20 text-warning border-warning/30",
  late_breaking_mismatch: "bg-info/20 text-info border-info/30",
};

type SortKey = "score" | "type" | "exchange" | "category" | "lastUpdated";

export function InefficiencyLeaderboard() {
  const { data, isLoading } = useSWR<ApiPayload<InefficiencyScore[]>>(
    "/api/inefficiencies",
    fetcher,
    {
      refreshInterval: REFRESH.inefficiencies,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<InefficiencyType | "all">("all");
  const [detail, setDetail] = useState<InefficiencyScore | null>(null);

  const updateChartContext = useDashboard((s) => s.updateChartContext);
  useEffect(() => {
    if (data?.data) {
      updateChartContext("inefficiency-leaderboard", {
        inefficiencyScores: data.data,
      });
    }
  }, [data?.data, updateChartContext]);

  const rows = useMemo(() => {
    const list = (data?.data ?? []).filter(
      (r) => filter === "all" || r.type === filter,
    );
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [data?.data, filter, sortKey, sortDir]);

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader title="Inefficiency leaderboard" />
        <ChartSkeleton />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Inefficiency leaderboard"
        subtitle={`${rows.length} flagged · sorted by ${sortKey}`}
        right={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs"
            >
              <option value="all">All types</option>
              <option value="resolution_bias">Resolution bias</option>
              <option value="cross_venue_divergence">Cross-venue divergence</option>
              <option value="liquidity_gap">Liquidity gap</option>
              <option value="late_breaking_mismatch">Late-breaking mismatch</option>
            </select>
            <span className="rounded-md border border-border bg-bg-elev px-2 py-0.5 font-mono text-[10px] text-fg-muted">
              {data?.cache ?? "…"}
            </span>
          </div>
        }
      />
      <CardBody className="px-0 py-0">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-bg-card/95 backdrop-blur">
              <tr className="text-[10px] uppercase tracking-wider text-fg-muted">
                <Th
                  onClick={() => {
                    setSortKey("score");
                    setSortDir((d) =>
                      sortKey === "score" && d === "desc" ? "asc" : "desc",
                    );
                  }}
                >
                  Score
                </Th>
                <Th
                  onClick={() => {
                    setSortKey("type");
                    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  }}
                >
                  Type
                </Th>
                <th className="px-4 py-2">Title</th>
                <Th
                  onClick={() => {
                    setSortKey("exchange");
                    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  }}
                >
                  Venue
                </Th>
                <Th
                  onClick={() => {
                    setSortKey("category");
                    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  }}
                >
                  Category
                </Th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setDetail(r)}
                  className="cursor-pointer border-t border-border-subtle hover:bg-bg-hover"
                >
                  <td className="px-4 py-2 font-mono font-semibold text-fg">
                    {r.score.toFixed(0)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                        TYPE_COLOR[r.type],
                      )}
                    >
                      {TYPE_LABEL[r.type]}
                    </span>
                  </td>
                  <td className="max-w-[340px] truncate px-4 py-2 text-fg">
                    {r.title}
                  </td>
                  <td className="px-4 py-2 capitalize text-fg-muted">
                    {r.exchange}
                  </td>
                  <td className="px-4 py-2 text-fg-muted">{r.category}</td>
                  <td className="px-4 py-2 text-fg-subtle">
                    {formatDistanceToNow(new Date(r.lastUpdated), {
                      addSuffix: true,
                    })}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-fg-muted"
                  >
                    No inefficiencies match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardBody>

      {detail && (
        <DetailModal detail={detail} onClose={() => setDetail(null)} />
      )}
    </Card>
  );
}

function Th({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <th
      className="cursor-pointer px-4 py-2 hover:text-fg"
      onClick={onClick}
    >
      {children}
    </th>
  );
}

function DetailModal({
  detail,
  onClose,
}: {
  detail: InefficiencyScore;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-border bg-bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <div
              className={cn(
                "inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                TYPE_COLOR[detail.type],
              )}
            >
              {TYPE_LABEL[detail.type]}
            </div>
            <h3 className="mt-2 text-base font-semibold">{detail.title}</h3>
            <p className="mt-1 text-xs text-fg-muted">
              {detail.exchange} · {detail.category}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
          <Stat label="Score" value={detail.score.toFixed(0)} />
          {detail.spread !== undefined && (
            <Stat
              label="Spread"
              value={`${(detail.spread * 100).toFixed(1)}pp`}
            />
          )}
          {detail.noResolutionRate !== undefined && (
            <Stat
              label="NO-rate"
              value={`${(detail.noResolutionRate * 100).toFixed(1)}%`}
            />
          )}
          {detail.zScore !== undefined && (
            <Stat label="Z-score" value={detail.zScore.toFixed(2)} />
          )}
          {detail.liquidityRatio !== undefined && (
            <Stat
              label="Vol/Liq"
              value={formatRatio(detail.liquidityRatio)}
            />
          )}
          {detail.liquidityRatio !== undefined &&
            detail.liquidityPopulation && (
              <Stat
                label="σ above mean"
                value={`${(
                  (detail.liquidityRatio -
                    detail.liquidityPopulation.mean) /
                  detail.liquidityPopulation.sd
                ).toFixed(1)}σ`}
              />
            )}
        </div>

        {detail.type === "liquidity_gap" &&
          detail.liquidityRatio !== undefined &&
          detail.liquidityPopulation && (
            <LiquidityDistributionViz
              ratio={detail.liquidityRatio}
              stats={detail.liquidityPopulation}
            />
          )}

        <div className="mt-5 rounded-lg border border-border-subtle bg-bg-elev p-3 text-xs leading-relaxed text-fg">
          {detail.details}
        </div>

        <div className="mt-4 text-[10px] text-fg-subtle">
          Last updated {formatDistanceToNow(new Date(detail.lastUpdated), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elev px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-fg-muted">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-base font-semibold">{value}</div>
    </div>
  );
}

function formatRatio(r: number): string {
  if (r >= 1_000_000) return `${(r / 1_000_000).toFixed(2)}M`;
  if (r >= 1_000) return `${(r / 1_000).toFixed(2)}k`;
  return r.toFixed(2);
}

/**
 * Compact two-row distribution visual for a liquidity_gap row.
 *
 * Row 1 — σ ruler: shows where this market's Vol/Liq ratio lands relative
 *   to the population mean (0σ), the ±1σ band, and the 2σ flag threshold.
 * Row 2 — log-axis bar: absolute magnitude on a log scale so readers can
 *   see the raw ratio vs the mean without the outlier dominating the axis.
 */
function LiquidityDistributionViz({
  ratio,
  stats,
}: {
  ratio: number;
  stats: { mean: number; sd: number; threshold: number; n: number };
}) {
  const sigmas = (ratio - stats.mean) / stats.sd;
  const thresholdSigmas = (stats.threshold - stats.mean) / stats.sd;
  const axisMin = -3;
  const axisMax = Math.max(3, Math.ceil(sigmas) + 0.5);
  const sToPct = (s: number) =>
    Math.max(0, Math.min(100, ((s - axisMin) / (axisMax - axisMin)) * 100));

  const logMin = Math.log10(Math.max(1, stats.mean / 10));
  const logMax = Math.log10(Math.max(stats.threshold, ratio) * 1.15);
  const vToPct = (v: number) =>
    Math.max(
      0,
      Math.min(
        100,
        ((Math.log10(Math.max(1, v)) - logMin) / (logMax - logMin)) * 100,
      ),
    );

  return (
    <div className="mt-5 rounded-lg border border-border-subtle bg-bg-elev p-4">
      <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-muted">
        <span>Vol/Liq distribution</span>
        <span>n = {stats.n}</span>
      </div>

      <div className="relative h-12 w-full">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <div
          className="absolute top-1/2 h-5 -translate-y-1/2 rounded-sm bg-fg-muted/15"
          style={{
            left: `${sToPct(-1)}%`,
            width: `${sToPct(1) - sToPct(-1)}%`,
          }}
          title="±1σ"
        />
        <div
          className="absolute top-1 bottom-1 w-px bg-success/80"
          style={{ left: `${sToPct(0)}%` }}
          title={`mean ${formatRatio(stats.mean)}`}
        />
        <div
          className="absolute top-1 bottom-1 w-px bg-warning"
          style={{ left: `${sToPct(thresholdSigmas)}%` }}
          title={`2σ threshold ${formatRatio(stats.threshold)}`}
        />
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger ring-2 ring-bg-elev"
          style={{ left: `${sToPct(sigmas)}%` }}
          title={`this market · ${formatRatio(ratio)}`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between font-mono text-[9px] text-fg-subtle">
          <span>−3σ</span>
          <span>0</span>
          <span>+{axisMax.toFixed(0)}σ</span>
        </div>
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-wider text-fg-muted">
        Log axis · absolute ratio
      </div>
      <div className="relative mt-2 h-8 w-full rounded-sm bg-bg-card">
        <div
          className="absolute top-0 bottom-0 w-px bg-success/80"
          style={{ left: `${vToPct(stats.mean)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-warning"
          style={{ left: `${vToPct(stats.threshold)}%` }}
        />
        <div
          className="absolute top-1 bottom-1 rounded-sm bg-danger/70"
          style={{ left: 0, width: `${vToPct(ratio)}%` }}
        />
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-danger ring-2 ring-bg-card"
          style={{ left: `${vToPct(ratio)}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 font-mono text-[10px]">
        <div className="flex items-center gap-1.5 text-fg-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          mean {formatRatio(stats.mean)}
        </div>
        <div className="flex items-center gap-1.5 text-fg-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-warning" />
          2σ flag {formatRatio(stats.threshold)}
        </div>
        <div className="flex items-center gap-1.5 text-fg-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-danger" />
          this {formatRatio(ratio)}
        </div>
      </div>
    </div>
  );
}
