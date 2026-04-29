"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface KPICardProps {
  label: string;
  value: number | string;
  suffix?: string;
  delta?: number; // e.g. +0.023 → "+2.3%"
  format?: "number" | "percent" | "usd" | "string";
  hint?: string;
  loading?: boolean;
}

export function KPICard({
  label,
  value,
  suffix,
  delta,
  format = "number",
  hint,
  loading,
}: KPICardProps) {
  const numericTarget =
    typeof value === "number" && format !== "string" ? value : null;
  const display = useCountUp(numericTarget);

  const formatted =
    loading
      ? "—"
      : format === "string" || typeof value === "string"
        ? String(value)
        : formatValue(numericTarget === null ? 0 : display, format);

  const deltaColor = delta === undefined
    ? ""
    : delta > 0
      ? "text-success"
      : delta < 0
        ? "text-danger"
        : "text-fg-muted";

  return (
    <div className="rounded-xl border border-border bg-bg-card/80 p-4 shadow-lg shadow-black/10">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="font-mono text-2xl font-semibold tabular-nums text-fg">
          {formatted}
          {suffix && <span className="ml-1 text-base text-fg-muted">{suffix}</span>}
        </div>
        {delta !== undefined && !loading && (
          <div className={cn("text-xs font-medium", deltaColor)}>
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(1)}%
          </div>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-fg-subtle">{hint}</div>}
    </div>
  );
}

function formatValue(v: number, format: "number" | "percent" | "usd"): string {
  if (!Number.isFinite(v)) return "—";
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  if (format === "usd") {
    const abs = Math.abs(v);
    if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  }
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function useCountUp(target: number | null) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    const start = value;
    const delta = target - start;
    if (delta === 0) return;
    const duration = 600;
    const begin = performance.now();

    const step = (t: number) => {
      const p = Math.min(1, (t - begin) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(start + delta * eased);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
