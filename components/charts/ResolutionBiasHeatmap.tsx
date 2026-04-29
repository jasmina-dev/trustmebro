"use client";

import useSWR from "swr";
import { fetcher, REFRESH, type ApiPayload } from "@/lib/api";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { ChartSkeleton } from "../ui/Skeleton";
import { useEffect, useState } from "react";
import { useDashboard } from "@/lib/store";
import type { ResolutionBiasBucket } from "@/lib/types";

const CATEGORIES = ["Politics", "Crypto", "Finance", "Other"];
const EXCHANGES = ["polymarket", "kalshi"] as const;
const LOW_SAMPLE = 30;

/**
 * Categorical palette per the sprint spec:
 *   < 55%   balanced (green)
 *   55–65%  moderate NO lean (amber)
 *   65–75%  strong NO lean  (orange)
 *   ≥ 75%   extreme NO lean (red)
 *
 * We rescale to 0–100 once up-front so the function is agnostic to whether
 * the API hands us a 0–1 rate or a 0–100 percentage.
 */
function biasColor(noRateFraction: number): string {
  const pct = noRateFraction * 100;
  if (!Number.isFinite(pct)) return "#1f2330";
  if (pct < 55) return "#10b981";
  if (pct < 65) return "#f59e0b";
  if (pct < 75) return "#f97316";
  return "#ef4444";
}

/**
 * Pick a text colour that stays legible on the cell background.
 * The four bias colours above are all bright/saturated enough that white
 * text works everywhere — except green (<55%) which tips toward too-light.
 */
function textOn(bg: string): string {
  return bg === "#10b981" ? "#052e16" : "#0b0d12";
}

export function ResolutionBiasHeatmap() {
  const { data, isLoading } = useSWR<ApiPayload<ResolutionBiasBucket[]>>(
    "/api/resolution-bias",
    fetcher,
    {
      refreshInterval: REFRESH.resolution,
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const [hover, setHover] = useState<ResolutionBiasBucket | null>(null);

  const updateChartContext = useDashboard((s) => s.updateChartContext);
  useEffect(() => {
    if (data?.data) {
      updateChartContext("resolution-bias-heatmap", {
        resolutionStats: data.data,
      });
    }
  }, [data?.data, updateChartContext]);

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader title="Resolution bias heatmap" />
        <ChartSkeleton />
      </Card>
    );
  }

  const buckets = data?.data ?? [];
  const lookup = new Map(
    buckets.map((b) => [`${b.category}|${b.exchange}`, b]),
  );
  const totalN = buckets.reduce((s, b) => s + b.total, 0);
  const flaggedCount = buckets.filter((b) => b.flagged).length;

  return (
    <Card>
      <CardHeader
        title="Resolution bias heatmap"
        subtitle={`NO-resolution rate per category × venue · ${flaggedCount} flagged`}
      />
      <CardBody>
        <div className="flex flex-col gap-2">
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `90px repeat(${CATEGORIES.length}, minmax(0, 1fr))`,
            }}
          >
            <div />
            {CATEGORIES.map((c) => (
              <div
                key={c}
                className="text-center text-[10px] font-medium uppercase tracking-wider text-fg-muted"
              >
                {c}
              </div>
            ))}

            {EXCHANGES.map((ex) => (
              <HeatmapRow
                key={ex}
                exchange={ex}
                categories={CATEGORIES}
                lookup={lookup}
                onHover={setHover}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-fg-muted">
            <span className="font-medium uppercase tracking-wider">Scale</span>
            <LegendSwatch color="#10b981" label="< 55%" />
            <LegendSwatch color="#f59e0b" label="55–65%" />
            <LegendSwatch color="#f97316" label="65–75%" />
            <LegendSwatch color="#ef4444" label="≥ 75%" />
            <div className="ml-auto">sample: {totalN.toLocaleString()}</div>
          </div>

          {hover && <HoverCard bucket={hover} />}
        </div>
      </CardBody>
    </Card>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-4 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </div>
  );
}

function HeatmapRow({
  exchange,
  categories,
  lookup,
  onHover,
}: {
  exchange: string;
  categories: string[];
  lookup: Map<string, ResolutionBiasBucket>;
  onHover: (b: ResolutionBiasBucket | null) => void;
}) {
  return (
    <>
      <div className="flex items-center text-[11px] font-medium capitalize text-fg-muted">
        {exchange}
      </div>
      {categories.map((c) => {
        const b = lookup.get(`${c}|${exchange}`);
        const hasData = !!b && b.total > 0;
        const rate = hasData ? b!.noRate : 0;
        const bg = hasData ? biasColor(rate) : "#1f2330";
        const fg = hasData ? textOn(bg) : "#8b91a1";

        return (
          <div
            key={`${c}-${exchange}`}
            onMouseEnter={() => b && onHover(b)}
            onMouseLeave={() => onHover(null)}
            className="group relative flex h-16 cursor-pointer flex-col items-center justify-center rounded-md border border-border transition-transform hover:scale-[1.03]"
            style={{ background: bg }}
          >
            {!hasData ? (
              <span className="text-[10px] font-medium text-fg-muted">
                No data
              </span>
            ) : (
              <>
                <span
                  className="font-mono text-sm font-semibold leading-none"
                  style={{ color: fg }}
                >
                  {(rate * 100).toFixed(0)}% NO
                </span>
                <span
                  className="mt-1 text-[9px] leading-none opacity-80"
                  style={{ color: fg }}
                >
                  N={b!.total}
                  {b!.total >= LOW_SAMPLE
                    ? ` · z=${b!.zScore.toFixed(1)}`
                    : ""}
                </span>
                {b!.total > 0 && b!.total < LOW_SAMPLE && (
                  <span
                    className="absolute right-1 top-1 rounded-sm bg-black/30 px-1 text-[9px] font-medium leading-none text-white/90"
                    title="Low sample — treat z-score with suspicion"
                  >
                    ⚠
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function HoverCard({ bucket }: { bucket: ResolutionBiasBucket }) {
  const absZ = Math.abs(bucket.zScore);
  const sig = absZ >= 2.58 ? "p<0.01" : absZ >= 1.96 ? "p<0.05" : null;
  const lean =
    bucket.total === 0
      ? "neutral"
      : bucket.noRate > 0.55
        ? "no"
        : bucket.noRate < 0.45
          ? "yes"
          : "neutral";

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-elev p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {bucket.category} · {bucket.exchange}
        </span>
        {bucket.flagged && (
          <span className="rounded-md border border-danger/40 bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger">
            Flagged
          </span>
        )}
        {lean !== "neutral" && !bucket.lowSample && (
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              lean === "no"
                ? "border-danger/40 bg-danger/15 text-danger"
                : "border-info/40 bg-info/15 text-info"
            }`}
          >
            {lean === "no" ? "NO-biased" : "YES-biased"}
            {sig ? ` · ${sig}` : ""}
          </span>
        )}
        {bucket.lowSample && bucket.total > 0 && (
          <span className="rounded-md border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
            Low sample
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-3 text-fg-muted">
        <div>
          NO{" "}
          <span className="text-danger">
            {(bucket.noRate * 100).toFixed(1)}%
          </span>
        </div>
        <div>
          YES{" "}
          <span className="text-success">
            {(bucket.yesRate * 100).toFixed(1)}%
          </span>
        </div>
        <div>
          n = <span className="text-fg">{bucket.total}</span>
        </div>
        <div>
          z = <span className="text-fg">{bucket.zScore.toFixed(2)}</span>
        </div>
      </div>
      {(bucket.ambiguous ?? 0) > 0 && (
        <div className="mt-2 text-[10px] text-fg-subtle">
          {bucket.ambiguous} multi-outcome / unresolved markets excluded from
          the binary count.
        </div>
      )}
    </div>
  );
}
