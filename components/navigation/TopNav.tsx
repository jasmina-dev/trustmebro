"use client";

import { useDashboard } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { ExchangeFilter } from "@/lib/types";

const VENUES: Array<{ id: ExchangeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "polymarket", label: "Polymarket" },
  { id: "kalshi", label: "Kalshi" },
];

const CATEGORIES = ["All", "Sports", "Politics", "Crypto", "Finance", "Other"];

export function TopNav() {
  const { activeVenue, setVenue, activeCategory, setCategory, dateRange, setDateRange, setChatOpen, chatOpen } =
    useDashboard();

  const startDate = new Date(dateRange.start).toISOString().slice(0, 10);
  const endDate = new Date(dateRange.end).toISOString().slice(0, 10);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-lg">
      <div className="flex h-14 items-center gap-6 px-4 md:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-accent to-info text-xs font-bold text-white">
            TMB
          </div>
          <div className="hidden flex-col leading-tight md:flex">
            <span className="text-sm font-semibold tracking-tight">trustmebro</span>
            <span className="text-[10px] uppercase tracking-widest text-fg-muted">
              inefficiency dashboard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-elev p-1">
          {VENUES.map((v) => (
            <button
              key={v.id}
              onClick={() => setVenue(v.id)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                activeVenue === v.id
                  ? "bg-bg-card text-fg shadow"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <label className="text-xs text-fg-muted">Category</label>
          <select
            value={activeCategory}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-fg focus:border-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          <input
            type="date"
            value={startDate}
            onChange={(e) =>
              setDateRange({
                start: new Date(e.target.value).toISOString(),
                end: dateRange.end,
              })
            }
            className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-fg focus:border-accent"
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
            className="rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-fg focus:border-accent"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://pmxt.dev"
            target="_blank"
            rel="noopener"
            className="hidden text-xs text-fg-muted hover:text-fg md:inline"
          >
            data: pmxt.dev ↗
          </a>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              chatOpen
                ? "border-accent bg-accent text-white"
                : "border-border bg-bg-card text-fg hover:bg-bg-hover",
            )}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            Ask AI
          </button>
        </div>
      </div>
    </header>
  );
}
