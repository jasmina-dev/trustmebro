"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    setSidebarOpen(false);
    const target = document.getElementById(id);
    if (!target) return;
    // The dashboard's `<TopNav>` is `position: sticky` at the top of the
    // viewport. Without an offset, `scrollIntoView({ block: "start" })`
    // aligns the section's top to the viewport top, so the heading lands
    // hidden underneath the header. Set `scroll-margin-top` equal to the
    // header's actual rendered height so we land just below it.
    const headerHeight =
      document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    target.style.scrollMarginTop = `${headerHeight + 8}px`;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* ----- Desktop rail ----- */}
      <aside
        aria-label="Dashboard sections"
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
            {SECTIONS.map((s) => (
              <SidebarItem
                key={s.id}
                section={s}
                active={activeChart === s.id}
                collapsed={collapsed}
                onClick={() => handleSectionClick(s.id)}
              />
            ))}
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
                title={s.description}
                className={cn(
                  "flex w-full min-w-0 items-center rounded-tmb border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-border bg-bg-card text-fg hover:bg-bg-hover",
                )}
              >
                <span className="w-full truncate text-sm font-semibold leading-snug">
                  {s.label}
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

type Section = (typeof SECTIONS)[number];

/**
 * A single desktop-rail nav item with a portal-rendered hover tooltip
 * showing the section's description.
 *
 * @remarks
 * The tooltip is rendered into `document.body` via a portal so it can escape
 * the sidebar's scroll container (which would otherwise clip it horizontally).
 * Position is computed from the trigger button's bounding rect on each open.
 */
function SidebarItem({
  section,
  active,
  collapsed,
  onClick,
}: {
  section: Section;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const recomputeCoords = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    });
  }, []);

  const showTip = () => {
    recomputeCoords();
    setOpen(true);
  };

  const hideTip = () => setOpen(false);

  // Keep the portal-rendered tooltip stuck to the trigger while it's open.
  // The sidebar `<nav>` is `overflow-y-auto`, so its inner scroll moves the
  // button without firing mouseenter/leave when the user is keyboard-focused
  // (or when the cursor stays within the same button mid-scroll). Window
  // resize has the same staleness problem. We listen on `window` with
  // `capture: true` so we observe scroll events from any ancestor (DOM
  // scroll events don't bubble to window otherwise).
  useEffect(() => {
    if (!open) return;
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("scroll", recomputeCoords, opts);
    window.addEventListener("resize", recomputeCoords);
    return () => {
      window.removeEventListener("scroll", recomputeCoords, opts);
      window.removeEventListener("resize", recomputeCoords);
    };
  }, [open, recomputeCoords]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
        className={cn(
          "flex w-full items-center rounded-tmb border px-tmb4 py-tmb3 text-left transition-colors",
          active
            ? "border-accent bg-accent/10 text-fg"
            : "border-border bg-bg-card text-fg hover:bg-bg-hover",
        )}
        aria-label={section.label}
        aria-describedby={open ? `sidebar-tip-${section.id}` : undefined}
      >
        <span className="truncate text-sm font-semibold leading-snug">
          {collapsed ? section.label.slice(0, 2) : section.label}
        </span>
      </button>
      {open &&
        mounted &&
        createPortal(
          <div
            id={`sidebar-tip-${section.id}`}
            role="tooltip"
            className="pointer-events-none fixed z-50 w-56 -translate-y-1/2 rounded-md border border-border bg-bg-card px-3 py-2 text-xs leading-snug shadow-xl"
            style={{ top: coords.top, left: coords.left }}
          >
            <div className="mb-0.5 font-semibold text-fg">{section.label}</div>
            <div className="text-fg-muted">{section.description}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
