"use client";

import { useDashboard } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { ExchangeFilter } from "@/lib/types";

const VENUES: Array<{ id: ExchangeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "polymarket", label: "Polymarket" },
  { id: "kalshi", label: "Kalshi" },
];

const CATEGORIES = ["All", "Politics", "Crypto", "Finance", "Other"];

export function TopNav() {
  const { activeVenue, setVenue, activeCategory, setCategory, dateRange, setDateRange, setChatOpen, chatOpen } =
    useDashboard();

  const startDate = new Date(dateRange.start).toISOString().slice(0, 10);
  const endDate = new Date(dateRange.end).toISOString().slice(0, 10);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="border-b border-border bg-bg-card px-tmb7 py-tmb5">
        <div className="mx-auto flex max-w-tmb-header flex-wrap items-start gap-x-tmb8 gap-y-tmb5">
          <div className="min-w-56">
            <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-fg">
              TrustMeBro Analytics
            </h1>
            <p className="m-0 mt-1 text-sm text-fg-muted">
              Prediction markets dashboard &amp; research assistant
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
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
                "rounded-tmb px-tmb5 py-tmb4 text-sm font-semibold text-white transition-colors",
                chatOpen
                  ? "bg-accent-hover"
                  : "bg-accent shadow-tmb-chat-toggle hover:bg-accent-hover",
              )}
            >
              {chatOpen ? "Close chat" : "Ask AI"}
            </button>
          </div>
        </div>
      </div>

      <nav className="border-b border-border bg-bg px-tmb7 py-tmb4" aria-label="Market filters">
        <div className="mx-auto flex max-w-tmb-header flex-wrap items-center gap-tmb2">
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-fg-muted">
            Source
          </span>
          {VENUES.map((v) => (
            <button
              key={v.id}
              onClick={() => setVenue(v.id)}
              className={cn(
                "rounded-tmb border px-tmb5 py-tmb2 text-sm font-medium transition-colors",
                activeVenue === v.id
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-bg-card text-fg hover:bg-bg-hover",
              )}
            >
              {v.label}
            </button>
          ))}

        <div className="ml-tmb5 hidden items-center gap-tmb2 lg:flex">
          <label className="text-xs font-bold uppercase tracking-wider text-fg-muted">
            Category
          </label>
          <select
            value={activeCategory}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-tmb border border-border bg-bg-card px-tmb4 py-tmb2 font-number text-sm font-medium text-fg focus:border-accent"
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
