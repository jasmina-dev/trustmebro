"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useDashboard } from "@/lib/store";

const SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    description: "KPIs + leaderboard",
  },
  {
    id: "resolution-bias-heatmap",
    label: "Resolution bias",
    description: "Category × venue NO-rate heatmap",
  },
  {
    id: "cross-venue-divergence",
    label: "Cross-venue divergence",
    description: "Polymarket vs Kalshi price spreads",
  },
  {
    id: "market-momentum",
    label: "Market momentum",
    description: "Top 24h movers by direction",
  },
  {
    id: "calibration",
    label: "Calibration curve",
    description: "Final price vs actual resolution",
  },
  {
    id: "efficiency-timeline",
    label: "Efficiency timeline",
    description: "Mispricing by month",
  },
  {
    id: "liquidity-gap",
    label: "Liquidity gap",
    description: "Volume vs liquidity outliers",
  },
  {
    id: "price-vs-resolution",
    label: "Price vs resolution",
    description: "Late-breaking mismatch inspector",
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    description: "Sortable score table",
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const activeChart = useDashboard((s) => s.activeChart);
  const setActiveChart = useDashboard((s) => s.setActiveChart);

  return (
    <aside
      className={cn(
        "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-r border-border bg-bg-elev/50 transition-all duration-200 md:block",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 py-3">
          {!collapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-muted">
              Jump to
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md border border-border bg-bg-card p-1 text-fg-muted hover:text-fg"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn("transition-transform", collapsed && "rotate-180")}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {SECTIONS.map((s) => {
            const active = activeChart === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActiveChart(s.id);
                  document
                    .getElementById(s.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "group flex w-full flex-col items-start rounded-lg border border-transparent px-3 py-2 text-left text-xs transition-colors",
                  active
                    ? "border-border bg-bg-card text-fg"
                    : "text-fg-muted hover:bg-bg-card/60 hover:text-fg",
                )}
                title={collapsed ? s.label : undefined}
              >
                <span className="truncate font-medium">
                  {collapsed ? s.label.slice(0, 2) : s.label}
                </span>
                {!collapsed && (
                  <span className="mt-0.5 truncate text-[10px] text-fg-subtle group-hover:text-fg-muted">
                    {s.description}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-border-subtle p-3 text-[10px] leading-relaxed text-fg-subtle">
            <div className="mb-1 font-medium text-fg-muted">Cache</div>
            <div>Live · 60s</div>
            <div>Resolved · 1h</div>
            <div>Inefficiencies · 5m</div>
            <div>Archive · 24h</div>
          </div>
        )}
      </div>
    </aside>
  );
}
