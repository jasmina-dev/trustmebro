"use client";

import { useDashboard } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { ExchangeFilter } from "@/lib/types";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Top navigation bar for dashboard-wide controls.
 *
 * @remarks
 * Owns the primary global filters (venue, category, date range) and the chat
 * open/close toggle. State is persisted in the shared dashboard store.
 *
 * The layout collapses progressively on smaller breakpoints:
 *   - phones: hamburger + compact title, single-line venue chips that allow
 *     horizontal scroll, category select wraps below
 *   - tablet (md): full title row with secondary actions
 *   - desktop (xl): exposes the date range pickers as well
 */
const VENUES: Array<{ id: ExchangeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "polymarket", label: "Polymarket" },
  { id: "kalshi", label: "Kalshi" },
];

const CATEGORIES = ["All", "Politics", "Crypto", "Finance", "Other"];

export function TopNav() {
  const {
    activeVenue,
    setVenue,
    activeCategory,
    setCategory,
    dateRange,
    setDateRange,
    setChatOpen,
    chatOpen,
    setSidebarOpen,
  } = useDashboard();

  const startDate = new Date(dateRange.start).toISOString().slice(0, 10);
  const endDate = new Date(dateRange.end).toISOString().slice(0, 10);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="border-b border-border bg-bg-card px-4 py-3 md:px-tmb7 md:py-tmb5">
        <div className="mx-auto flex max-w-tmb-header flex-wrap items-center gap-x-tmb6 gap-y-tmb4 md:items-start md:gap-x-tmb8 md:gap-y-tmb5">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open section menu"
            className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-tmb border border-border bg-bg-card text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1 md:min-w-56 md:flex-none">
            <h1 className="m-0 truncate text-lg font-bold leading-tight tracking-tight text-fg sm:text-xl md:text-2xl">
              TrustMeBro Analytics
            </h1>
            <p className="m-0 mt-0.5 hidden text-xs text-fg-muted sm:block sm:text-sm md:mt-1">
              Prediction markets dashboard &amp; research assistant
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <a
              href="https://pmxt.dev"
              target="_blank"
              rel="noopener"
              className="hidden text-sm text-fg-muted hover:text-fg hover:underline md:inline"
            >
              data: pmxt.dev ↗
            </a>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={cn(
                "rounded-tmb px-3 py-1.5 text-xs font-semibold text-white transition-colors md:px-tmb5 md:py-tmb4 md:text-sm",
                chatOpen
                  ? "bg-accent-hover"
                  : "bg-accent shadow-tmb-chat-toggle hover:bg-accent-hover",
              )}
            >
              {chatOpen ? "Close chat" : "Ask AI"}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <nav
        className="border-b border-border bg-bg px-3 py-2 md:px-tmb7 md:py-tmb4"
        aria-label="Market filters"
      >
        <div className="mx-auto flex max-w-tmb-header flex-wrap items-center gap-tmb2">
          {/* Venue chips: scroll horizontally on small screens so they never
              get squished into a wrapped second line on a 320px viewport. */}
          <div className="-mx-1 flex w-full items-center gap-tmb2 overflow-x-auto px-1 md:w-auto md:overflow-visible">
            <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-fg-muted md:text-xs">
              Source
            </span>
            {VENUES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVenue(v.id)}
                className={cn(
                  "shrink-0 rounded-tmb border px-tmb4 py-tmb2 text-xs font-medium transition-colors md:px-tmb5 md:text-sm",
                  activeVenue === v.id
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-bg-card text-fg hover:bg-bg-hover",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-tmb2 md:ml-tmb5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted md:text-xs">
              Category
            </label>
            <select
              value={activeCategory}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-tmb border border-border bg-bg-card px-tmb3 py-tmb2 font-number text-xs font-medium text-fg focus:border-accent md:px-tmb4 md:text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden items-center gap-tmb2 xl:flex">
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                setDateRange({
                  start: new Date(e.target.value).toISOString(),
                  end: dateRange.end,
                })
              }
              className="rounded-tmb border border-border bg-bg-card px-tmb4 py-tmb2 font-number text-sm font-medium text-fg focus:border-accent"
            />
            <span className="text-xs text-fg-muted">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) =>
                setDateRange({
                  start: dateRange.start,
                  end: new Date(e.target.value).toISOString(),
                })
              }
              className="rounded-tmb border border-border bg-bg-card px-tmb4 py-tmb2 text-sm font-medium text-fg focus:border-accent"
            />
          </div>
        </div>
      </nav>
    </header>
  );
}
