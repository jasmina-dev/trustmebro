"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useDashboard } from "@/lib/store";

/**
 * Sidebar section navigation for the dashboard.
 *
 * @remarks
 * Keeps the active chart section in the shared store and scrolls to the
 * corresponding anchor for a "single-page report" style flow.
 *
 * Two modes:
 *   - desktop (md+): a sticky, optionally collapsible rail
 *   - mobile (< md): an off-canvas drawer driven by `sidebarOpen` in the
 *     dashboard store (toggled from the hamburger button in `TopNav`)
 */
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
  {
    id: "first-time-users",
    label: "First-time users",
    description: "How to read and use this dashboard",
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const activeChart = useDashboard((s) => s.activeChart);
  const setActiveChart = useDashboard((s) => s.setActiveChart);
  const sidebarOpen = useDashboard((s) => s.sidebarOpen);
  const setSidebarOpen = useDashboard((s) => s.setSidebarOpen);

  // Lock body scroll while the mobile drawer is open so the page underneath
  // doesn't drift when the user swipes inside the drawer.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  // Auto-dismiss the drawer if the viewport grows past the md breakpoint
  // (e.g. user rotates a tablet) so the desktop rail isn't shadowed by a
  // stale open state and body-scroll-lock can release.
  useEffect(() => {
    if (typeof window === "undefined" || !sidebarOpen) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handle = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    if (mq.matches) setSidebarOpen(false);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, [sidebarOpen, setSidebarOpen]);

  const handleSectionClick = (id: string) => {
    setActiveChart(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSidebarOpen(false);
  };

  return (
    <>
      {/* ----- Desktop rail ----- */}
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
                className={cn(
                  "transition-transform",
                  collapsed && "rotate-180",
                )}
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
                  onClick={() => handleSectionClick(s.id)}
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
              <div className="font-number tabular-nums">
                Inefficiencies · 5m
              </div>
              <div className="font-number tabular-nums">Archive · 24h</div>
            </div>
          )}
        </div>
      </aside>

      {/* ----- Mobile drawer ----- */}
      <div
        onClick={() => setSidebarOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!sidebarOpen}
      />
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-[82vw] max-w-xs flex-col border-r border-border bg-bg-elev shadow-2xl transition-transform duration-300 md:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Section navigation"
        aria-hidden={!sidebarOpen}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
            Jump to
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            aria-label="Close section menu"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {SECTIONS.map((s) => {
            const active = activeChart === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleSectionClick(s.id)}
                className={cn(
                  "flex w-full min-w-0 flex-col items-start rounded-tmb border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-border bg-bg-card text-fg hover:bg-bg-hover",
                )}
              >
                <span className="w-full truncate text-sm font-semibold leading-snug">
                  {s.label}
                </span>
                <span className="mt-0.5 w-full truncate text-xs leading-snug text-fg-muted">
                  {s.description}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-fg-muted">
          <div className="mb-1 font-bold uppercase tracking-wider text-fg-muted">
            Cache
          </div>
          <div className="font-number tabular-nums">
            Live · 60s · Resolved · 1h · Ineff · 5m · Archive · 24h
          </div>
        </div>
      </aside>
    </>
  );
}
