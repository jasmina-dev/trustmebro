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
        "sticky top-tmb-nav hidden h-tmb-sidebar shrink-0 border-r border-border bg-bg transition-all duration-200 md:block",
        collapsed ? "w-tmb-sidebar-collapsed" : "w-tmb-sidebar",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-tmb4 py-tmb4">
          {!collapsed && (
            <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
              Jump to
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-tmb border border-border bg-bg-card p-tmb2 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
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

        <nav className="flex-1 space-y-tmb1 overflow-y-auto px-tmb2 py-tmb4">
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
                  "group flex w-full flex-col items-start rounded-tmb border px-tmb4 py-tmb3 text-left transition-colors",
                  active
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-border bg-bg-card text-fg hover:bg-bg-hover",
                )}
                title={collapsed ? s.label : undefined}
              >
                <span className="truncate text-sm font-semibold leading-snug">
                  {collapsed ? s.label.slice(0, 2) : s.label}
                </span>
                {!collapsed && (
                  <span className="mt-1 truncate text-xs leading-snug text-fg-muted">
                    {s.description}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-border p-tmb4 text-xs leading-relaxed text-fg-muted">
            <div className="mb-tmb1 font-bold uppercase tracking-wider text-fg-muted">
              Cache
            </div>
            <div className="font-number tabular-nums">Live · 60s</div>
            <div className="font-number tabular-nums">Resolved · 1h</div>
            <div className="font-number tabular-nums">Inefficiencies · 5m</div>
            <div className="font-number tabular-nums">Archive · 24h</div>
          </div>
        )}
      </div>
    </aside>
  );
}
