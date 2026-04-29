// utilized github copilot + cursor

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  fetchEvents,
  fetchMarkets,
  fetchTradesAnalytics,
  getSourceEventUrl,
  getSourceMarketUrl,
  type MarketSource,
  type PolymarketEvent,
  type PolymarketMarket,
  type TradesAnalytics,
} from "../api/client";
import { MarketList } from "./MarketList";
import { TrendChart, type TrendChartRow } from "./TrendChart";
import { TradesTimeSeriesChart } from "./TradesTimeSeriesChart";
import { PreDeadlineChart } from "./PreDeadlineChart";
import { WhaleAddressesPanel } from "./WhaleAddressesPanel";
import { SuspicionSignalLegend } from "./SuspicionSignalLegend";
import { SuspicionTermHelp, WhalesTermHelp } from "./dashboardTermHelp";
import { computeEventSuspicion, type SuspicionLevel } from "./suspicion";
import {
  loadTrimmedCashflowBuckets,
  saveStoredBuckets,
  mergeBucketSeries,
  trimBucketsToLookback,
  generateDemoHourlyBuckets,
  CASHFLOW_PERSIST_LOOKBACK_HOURS,
  buildMinimalAnalytics,
  applyWindowToAnalytics,
  densifyHourlyWindow,
} from "../lib/demoCashflowStore";
import { isSupabaseChartsConfigured } from "../lib/supabaseClient";
import {
  fetchGlobalHourlyCashflowFromSupabase,
  fetchHourlyCashflowForPolymarketIds,
} from "../lib/supabaseCandles";
import "./Dashboard.css";

const ONBOARDING_DISMISSED_KEY = "trustmebro:dashboard:onboarding-dismissed:v1";

type DashboardMainTab =
  | "markets"
  | "tradeFlow"
  | "newsSentiment"
  | "whale"
  | "researchNotes"
  | "firstTimeUser";

interface DashboardProps {
  source: MarketSource;
  category: string;
  onCategoryChange: (id: string) => void;
  categoryOptions: readonly { id: string; label: string }[];
  onContextChange?: (ctx: string) => void;
}

const MAIN_TABS: { id: DashboardMainTab; label: string }[] = [
  { id: "markets", label: "Markets" },
  { id: "tradeFlow", label: "Trade flow" },
  { id: "newsSentiment", label: "News & sentiment" },
  { id: "whale", label: "Whale activity" },
  { id: "researchNotes", label: "Research notes" },
  { id: "firstTimeUser", label: "First time user" },
];

type VolumeFilterId = "any" | "100k" | "1m" | "10m";

const VOLUME_FILTER_OPTIONS: { id: VolumeFilterId; label: string }[] = [
  { id: "any", label: "Any volume" },
  { id: "100k", label: "≥ $100k" },
  { id: "1m", label: "≥ $1M" },
  { id: "10m", label: "≥ $10M" },
];

type SuspicionFilterId = "all" | "high" | "medium" | "low";

function eventVolumeSum(e: PolymarketEvent): number {
  return (
    e.markets?.reduce(
      (s, m) => s + (m.volumeNum ?? (m.volume as number | undefined) ?? 0),
      0,
    ) ?? 0
  );
}

function primaryCategoryLabel(event: PolymarketEvent): string {
  const fromEvent = event.tmCategories?.[0]?.trim();
  if (fromEvent) return fromEvent;
  const fromMarket = event.markets?.find(
    (m) => (m.tmCategories?.length ?? 0) > 0,
  )?.tmCategories?.[0];
  if (fromMarket?.trim()) return fromMarket.trim();
  if (event.category?.trim()) return event.category.trim();
  return "Uncategorized";
}

function suspicionUi(level: SuspicionLevel): {
  label: string;
  className: string;
} {
  if (level === "high")
    return { label: "High", className: "suspicion-signal-high" };
  if (level === "medium")
    return { label: "Med", className: "suspicion-signal-medium" };
  return { label: "Low", className: "suspicion-signal-low" };
}

const CASHFLOW_WINDOWS = [
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: CASHFLOW_PERSIST_LOOKBACK_HOURS },
] as const;

function marketIdsForEvent(event: PolymarketEvent | undefined): string[] {
  if (!event?.markets?.length) return [];
  const ids = new Set<string>();
  for (const m of event.markets) {
    const c =
      m.conditionId ?? m.eventId ?? m.ticker ?? m.marketSlug ?? m.slug ?? m.id;
    if (c) ids.add(String(c));
  }
  return Array.from(ids);
}

function DashboardOnboardingBanner({
  onDismiss,
  sourceLabel,
}: {
  onDismiss: () => void;
  sourceLabel: string;
}) {
  return (
    <section
      className="dashboard-onboarding"
      aria-label="Dashboard introduction"
    >
      <div className="dashboard-onboarding-inner">
        <div className="dashboard-onboarding-copy">
          <p className="dashboard-onboarding-title">How to use this view</p>
          <ul className="dashboard-onboarding-list">
            <li>
              This dashboard pulls {sourceLabel} volume, whale concentration,
              and late-window activity into one research surface.
            </li>
            <li>
              &quot;Insider trading signals&quot; here means statistical red
              flags—not evidence of wrongdoing.
            </li>
            <li>
              Pick a trending bar to focus charts and the event list; open deep
              analysis when you want raw whales and timing detail.
            </li>
          </ul>
        </div>
        <button
          type="button"
          className="dashboard-onboarding-dismiss"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}

export function Dashboard({
  source,
  category,
  onCategoryChange,
  categoryOptions,
  onContextChange,
}: DashboardProps) {
  const sourceLabel = "Polymarket";
  const [events, setEvents] = useState<PolymarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalTradesRaw, setGlobalTradesRaw] =
    useState<TradesAnalytics | null>(null);
  const [persistedSeries, setPersistedSeries] = useState<
    TradesAnalytics["byTime"]
  >(() => (source === "polymarket" ? loadTrimmedCashflowBuckets() : []));
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState<number>(24);
  const [onboardingVisible, setOnboardingVisible] = useState(() => {
    try {
      return !localStorage.getItem(ONBOARDING_DISMISSED_KEY);
    } catch {
      return true;
    }
  });
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);
  const [focusedTradesRaw, setFocusedTradesRaw] =
    useState<TradesAnalytics | null>(null);
  const [focusedTradesLoading, setFocusedTradesLoading] = useState(false);
  const [focusedTradesError, setFocusedTradesError] = useState<string | null>(
    null,
  );
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  const [whaleAccordionOpen, setWhaleAccordionOpen] = useState(false);
  const [marketsAccordionOpen, setMarketsAccordionOpen] = useState(false);
  const [mainTab, setMainTab] = useState<DashboardMainTab>("markets");
  const [volumeFilter, setVolumeFilter] = useState<VolumeFilterId>("any");
  const [suspicionFilter, setSuspicionFilter] =
    useState<SuspicionFilterId>("all");

  const dismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setOnboardingVisible(false);
  }, []);

  useEffect(() => {
    setFocusedEventId(null);
    setFocusedTradesRaw(null);
    setFocusedTradesError(null);
    setFocusedTradesLoading(false);
    setPersistedSeries(
      source === "polymarket" ? loadTrimmedCashflowBuckets() : [],
    );
    setLoading(true);
    setError(null);
    Promise.all([fetchEvents(30, false, source), fetchMarkets(100, source)])
      .then(([eventList, markets]) => {
        const byEvent = new Map<string, PolymarketEvent>();
        for (const e of eventList) {
          if (e && e.id) byEvent.set(e.id, { ...e, markets: e.markets ?? [] });
        }
        for (const m of markets) {
          if (!m || !(m as unknown as { eventId?: string }).eventId) continue;
          const eid = (m as unknown as { eventId: string }).eventId;
          const ev = byEvent.get(eid);
          if (ev) {
            if (!ev.markets) ev.markets = [];
            if (!ev.markets.some((existing) => existing.id === m.id)) {
              ev.markets.push(m);
            }
          }
        }
        setEvents(Array.from(byEvent.values()));
      })
      .catch((err) => setError(err.message ?? "Failed to load data"))
      .finally(() => setLoading(false));
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    setTradesError(null);

    function applyPolymarketApiSeries(analytics: TradesAnalytics) {
      setGlobalTradesRaw(analytics);
      setTradesError(null);
      setPersistedSeries((prev) => {
        let merged = trimBucketsToLookback(
          mergeBucketSeries(prev, analytics.byTime),
          CASHFLOW_PERSIST_LOOKBACK_HOURS,
        );
        if (merged.length === 0) {
          merged = generateDemoHourlyBuckets(CASHFLOW_PERSIST_LOOKBACK_HOURS);
        }
        saveStoredBuckets(merged);
        return merged;
      });
    }

    function fallbackPersistedOnError(message: string) {
      setTradesError(message);
      setGlobalTradesRaw(null);
      if (source !== "polymarket") {
        setPersistedSeries([]);
        return;
      }
      setPersistedSeries((prev) => {
        const fromLs = prev.length ? prev : loadTrimmedCashflowBuckets();
        let merged = fromLs;
        if (merged.length === 0) {
          merged = generateDemoHourlyBuckets(CASHFLOW_PERSIST_LOOKBACK_HOURS);
          saveStoredBuckets(merged);
        }
        return merged;
      });
    }

    async function loadCashflowSeries() {
      if (
        source === "polymarket" &&
        isSupabaseChartsConfigured() &&
        !cancelled
      ) {
        const since = new Date(
          Date.now() - CASHFLOW_PERSIST_LOOKBACK_HOURS * 3_600_000,
        ).toISOString();
        const fromDb = await fetchGlobalHourlyCashflowFromSupabase(since);
        if (cancelled) return;
        if (fromDb.length > 0) {
          setPersistedSeries((prev) => {
            const merged = trimBucketsToLookback(
              mergeBucketSeries(prev, fromDb),
              CASHFLOW_PERSIST_LOOKBACK_HOURS,
            );
            saveStoredBuckets(merged);
            queueMicrotask(() => {
              if (cancelled) return;
              setGlobalTradesRaw(
                buildMinimalAnalytics(merged, CASHFLOW_PERSIST_LOOKBACK_HOURS),
              );
              setTradesError(null);
            });
            return merged;
          });
          return;
        }
      }

      if (cancelled) return;
      try {
        const res = await fetchTradesAnalytics({
          windowHours: CASHFLOW_PERSIST_LOOKBACK_HOURS,
          source,
        });
        if (cancelled) return;
        applyPolymarketApiSeries(res.analytics);
      } catch (err) {
        if (cancelled) return;
        fallbackPersistedOnError(
          err instanceof Error
            ? err.message
            : "Failed to load trades analytics",
        );
      }
    }

    void loadCashflowSeries();
    return () => {
      cancelled = true;
    };
  }, [source]);

  function extractYesPrice(
    market: PolymarketMarket | undefined,
  ): number | null {
    if (!market) return null;
    const rawPrice =
      market.outcomePrices ?? market.yesAsk ?? market.yesBid ?? market.price;
    if (rawPrice == null) return null;
    const first = String(rawPrice).split(",")[0];
    const v = parseFloat(first);
    if (!Number.isFinite(v)) return null;
    return v;
  }

  const filtered = useMemo(() => {
    if (category === "all") return events;
    const target = category.toLowerCase();
    return events.filter((e) => {
      const eventCats = e.tmCategories ?? [];
      if (eventCats.some((c) => c.toLowerCase() === target)) return true;
      for (const m of e.markets ?? []) {
        const marketCats = m.tmCategories ?? [];
        if (marketCats.some((c) => c.toLowerCase() === target)) return true;
      }
      return false;
    });
  }, [events, category]);

  const volumeFilteredEvents = useMemo(() => {
    if (volumeFilter === "any") return filtered;
    const thresholds: Record<Exclude<VolumeFilterId, "any">, number> = {
      "100k": 100_000,
      "1m": 1_000_000,
      "10m": 10_000_000,
    };
    const t = thresholds[volumeFilter as Exclude<VolumeFilterId, "any">];
    return filtered.filter((e) => eventVolumeSum(e) >= t);
  }, [filtered, volumeFilter]);

  useEffect(() => {
    if (!focusedEventId) return;
    const stillInVolumeScope = volumeFilteredEvents.some(
      (e) => e.id === focusedEventId,
    );
    if (!stillInVolumeScope) setFocusedEventId(null);
  }, [focusedEventId, volumeFilteredEvents]);

  useEffect(() => {
    if (!focusedEventId) {
      setFocusedTradesRaw(null);
      setFocusedTradesError(null);
      setFocusedTradesLoading(false);
      return;
    }
    let cancelled = false;
    setFocusedTradesLoading(true);
    setFocusedTradesError(null);

    const event = filtered.find((e) => e.id === focusedEventId);
    const marketIds = marketIdsForEvent(event);
    const eventIdParam = focusedEventId;

    async function loadFocused() {
      if (
        source === "polymarket" &&
        isSupabaseChartsConfigured() &&
        marketIds.length > 0
      ) {
        const since = new Date(
          Date.now() - CASHFLOW_PERSIST_LOOKBACK_HOURS * 3_600_000,
        ).toISOString();
        const buckets = await fetchHourlyCashflowForPolymarketIds(
          since,
          marketIds,
        );
        if (cancelled) return;
        if (buckets.length > 0) {
          setFocusedTradesRaw(
            buildMinimalAnalytics(buckets, CASHFLOW_PERSIST_LOOKBACK_HOURS),
          );
          setFocusedTradesError(null);
          setFocusedTradesLoading(false);
          return;
        }
      }

      if (cancelled) return;
      try {
        const res = await fetchTradesAnalytics({
          eventId: eventIdParam,
          windowHours: CASHFLOW_PERSIST_LOOKBACK_HOURS,
          source,
        });
        if (!cancelled) setFocusedTradesRaw(res.analytics);
      } catch (err) {
        if (!cancelled) {
          setFocusedTradesError(
            err instanceof Error
              ? err.message
              : "Failed to load trades for this event",
          );
          setFocusedTradesRaw(null);
        }
      } finally {
        if (!cancelled) setFocusedTradesLoading(false);
      }
    }

    void loadFocused();
    return () => {
      cancelled = true;
    };
  }, [focusedEventId, filtered, source]);

  const analytics = useMemo(() => {
    const allMarkets: PolymarketMarket[] = [];
    const eventVolumes: { id: string; title: string; volume: number }[] = [];
    const inconsistentEvents: string[] = [];

    for (const event of filtered) {
      const markets = event.markets ?? [];
      if (markets.length) {
        allMarkets.push(...markets);
      }

      const volume =
        markets.reduce(
          (s, m) => s + (m.volumeNum ?? (m.volume as number | undefined) ?? 0),
          0,
        ) ?? 0;

      eventVolumes.push({ id: event.id, title: event.title, volume });

      const maxProbs = markets
        .map((m) => extractYesPrice(m))
        .filter((p): p is number => p != null);
      const sumMax = maxProbs.reduce((s, v) => s + v, 0);

      if (maxProbs.length > 1 && sumMax > 1.5) {
        inconsistentEvents.push(event.title);
      }
    }

    const yesProbs: number[] = [];
    let extremeCount = 0;

    for (const m of allMarkets) {
      const p = extractYesPrice(m);
      if (p == null) continue;
      yesProbs.push(p);
      if (p >= 0.9 || p <= 0.1) extremeCount++;
    }

    const totalMarkets = yesProbs.length;
    const buckets = new Array(10).fill(0);
    for (const p of yesProbs) {
      const idx = Math.min(9, Math.max(0, Math.floor(p * 10)));
      buckets[idx]++;
    }

    const histogramData = buckets.map((count, idx) => ({
      bucket: `${idx * 10}-${idx === 9 ? 100 : (idx + 1) * 10}%`,
      count,
    }));

    const vols = eventVolumes.map((v) => v.volume).filter((v) => v > 0);
    let highVolumeEvents: ((typeof eventVolumes)[number] & { z: number })[] =
      [];

    if (vols.length) {
      const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
      const variance =
        vols.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vols.length;
      const std = Math.sqrt(variance) || 1;

      highVolumeEvents = eventVolumes
        .map((ev) => ({
          ...ev,
          z: std ? (ev.volume - mean) / std : 0,
        }))
        .filter((ev) => ev.z >= 2)
        .sort((a, b) => b.z - a.z)
        .slice(0, 5);
    }

    return {
      histogramData,
      extremeCount,
      totalMarkets,
      highVolumeEvents,
      inconsistentEvents,
    };
  }, [filtered]);

  const cashflowWindowLabel = useMemo(() => {
    if (windowHours === 6) return "last 6h";
    if (windowHours === 24) return "last 24h";
    if (windowHours === 24 * 7) return "last 7d";
    return `last ${windowHours}h`;
  }, [windowHours]);

  const displayAnalytics = useMemo(() => {
    if (focusedEventId) {
      if (focusedTradesLoading) return null;
      if (focusedTradesError) return null;
      if (!focusedTradesRaw) return null;
      return applyWindowToAnalytics(
        focusedTradesRaw,
        focusedTradesRaw.byTime,
        windowHours,
      );
    }

    if (globalTradesRaw === null && persistedSeries.length === 0) return null;
    if (globalTradesRaw) {
      return applyWindowToAnalytics(
        globalTradesRaw,
        persistedSeries,
        windowHours,
      );
    }
    const dense = densifyHourlyWindow(persistedSeries, windowHours);
    return buildMinimalAnalytics(dense, windowHours);
  }, [
    focusedEventId,
    focusedTradesLoading,
    focusedTradesError,
    focusedTradesRaw,
    globalTradesRaw,
    persistedSeries,
    windowHours,
  ]);

  const globalTradesPending =
    globalTradesRaw === null && tradesError === null && !focusedEventId;

  const cashFlowChartLoading = Boolean(focusedEventId) && focusedTradesLoading;

  const trendChartLoading = globalTradesPending && persistedSeries.length === 0;

  const eventsForList = useMemo(() => {
    if (!focusedEventId) return volumeFilteredEvents;
    return volumeFilteredEvents.filter((e) => e.id === focusedEventId);
  }, [volumeFilteredEvents, focusedEventId]);

  const highVolumeEventIds = useMemo(
    () => new Set(analytics.highVolumeEvents.map((e) => e.id)),
    [analytics.highVolumeEvents],
  );

  const inconsistentTitles = useMemo(
    () => new Set(analytics.inconsistentEvents),
    [analytics.inconsistentEvents],
  );

  const trendingChartDataAll: TrendChartRow[] = useMemo(() => {
    const sorted = volumeFilteredEvents
      .map((e) => ({
        event: e,
        volume:
          e.markets?.reduce((s, m) => s + (m.volumeNum ?? m.volume ?? 0), 0) ??
          0,
      }))
      .filter((x) => x.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    return sorted.map((x, rank) => {
      const title = x.event.title ?? "Untitled";
      const short = title.slice(0, 24) + (title.length > 24 ? "…" : "");
      return {
        eventId: x.event.id,
        name: short,
        fullName: title,
        volume: x.volume,
        suspicion: computeEventSuspicion(x.event, {
          highVolumeEventIds,
          inconsistentTitles,
          trades: globalTradesRaw,
          chartVolumeRank: rank,
          totalChartBars: sorted.length,
        }),
      };
    });
  }, [
    volumeFilteredEvents,
    highVolumeEventIds,
    inconsistentTitles,
    globalTradesRaw,
  ]);

  const trendingChartData: TrendChartRow[] = useMemo(() => {
    if (suspicionFilter === "all") return trendingChartDataAll;
    return trendingChartDataAll.filter((r) => r.suspicion === suspicionFilter);
  }, [trendingChartDataAll, suspicionFilter]);

  const handleTrendBarClick = useCallback((eventId: string) => {
    setFocusedEventId((prev) => (prev === eventId ? null : eventId));
  }, []);

  const clearFocus = useCallback(() => setFocusedEventId(null), []);

  const heroHeadlines = useMemo(() => {
    const headlines: {
      title: string;
      meta?: string;
      eventUrl?: string;
      marketUrl?: string;
    }[] = [];

    for (const event of events.slice(0, 6)) {
      const volume =
        event.markets?.reduce(
          (s, m) => s + (m.volumeNum ?? (m.volume as number | undefined) ?? 0),
          0,
        ) ?? 0;

      const title =
        event.title && event.title.length > 80
          ? `${event.title.slice(0, 80)}…`
          : (event.title ?? "Untitled market event");

      const metaParts: string[] = [];
      if (event.category) metaParts.push(event.category);
      if (volume > 0) metaParts.push(`$${volume.toLocaleString()} volume`);

      headlines.push({
        title,
        meta: metaParts.join(" • ") || undefined,
        eventUrl: getSourceEventUrl(source, event),
        marketUrl: getSourceMarketUrl(source, event.markets?.[0]),
      });
    }

    if (!headlines.length && displayAnalytics) {
      headlines.push({
        title: "Live trading window",
        meta: `${displayAnalytics.totalTrades.toLocaleString()} trades in recent window`,
      });
    }

    if (!headlines.length) {
      headlines.push({
        title: "Monitoring real-time prediction markets…",
        meta: "Waiting for market data from the API",
      });
    }

    return headlines;
  }, [events, displayAnalytics, source]);

  const contextString = useMemo(() => {
    const lines: string[] = [];
    const activeTabLabel =
      MAIN_TABS.find((tab) => tab.id === mainTab)?.label ?? mainTab;
    lines.push(`Active source: ${sourceLabel}`);
    lines.push(`Active tab: ${activeTabLabel}`);
    lines.push(`Active filter: ${category}`);
    lines.push(
      `Volume filter: ${VOLUME_FILTER_OPTIONS.find((o) => o.id === volumeFilter)?.label ?? volumeFilter}`,
    );
    lines.push(`Suspicion filter: ${suspicionFilter}`);
    lines.push(`Events loaded: ${filtered.length}`);
    if (focusedEventId) {
      const t = filtered.find((e) => e.id === focusedEventId)?.title;
      lines.push(`Focused event: ${t ?? focusedEventId}`);
    }

    const topEvents = filtered
      .map((e) => ({
        title: e.title,
        volume: (e.markets ?? []).reduce(
          (s, m) => s + (m.volumeNum ?? (m.volume as number | undefined) ?? 0),
          0,
        ),
      }))
      .filter((e) => e.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);

    if (topEvents.length) {
      lines.push("Top markets by volume:");
      for (const e of topEvents) {
        lines.push(`  - ${e.title}: $${e.volume.toLocaleString()}`);
      }
    }

    lines.push(
      `Probability analysis: ${analytics.extremeCount} of ${analytics.totalMarkets} markets at extreme probability (≥90% or ≤10%)`,
    );

    if (analytics.inconsistentEvents.length) {
      lines.push(
        `Cross-market inconsistencies (implied probs sum >150%): ${analytics.inconsistentEvents.slice(0, 5).join("; ")}`,
      );
    }

    if (displayAnalytics) {
      lines.push(`Trades analytics (${cashflowWindowLabel}):`);
      lines.push(`  Total trades: ${displayAnalytics.totalTrades}`);
      lines.push(
        `  Total volume: $${displayAnalytics.totalVolume.toLocaleString()}`,
      );
      lines.push(`  Unique traders: ${displayAnalytics.uniqueTraders}`);
      lines.push(`  Unique markets: ${displayAnalytics.uniqueMarkets}`);
      if (displayAnalytics.whaleTraders.length) {
        lines.push("  Top whale traders:");
        for (const w of displayAnalytics.whaleTraders.slice(0, 3)) {
          lines.push(
            `    - ${w.address}: $${w.volume.toLocaleString()} volume (${(w.shareOfTotalVolume * 100).toFixed(1)}% of total)`,
          );
        }
      }
      const pd = displayAnalytics.preDeadlineWindow;
      if (pd) {
        lines.push(
          `  Pre-deadline window (${pd.windowHours}h before resolution): $${pd.volume.toLocaleString()} volume, ${pd.tradeCount} trades (${(pd.shareOfTotalVolume * 100).toFixed(1)}% of total)`,
        );
      }
    }

    return lines.join("\n");
  }, [
    sourceLabel,
    category,
    filtered,
    analytics,
    displayAnalytics,
    cashflowWindowLabel,
    focusedEventId,
    mainTab,
    volumeFilter,
    suspicionFilter,
  ]);

  useEffect(() => {
    if (!loading) onContextChange?.(contextString);
  }, [contextString, loading, onContextChange]);

  if (loading) {
    return (
      <div className="dashboard dashboard-loading">
        <p>Loading market data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard dashboard-error">
        <p>{error}</p>
        <p className="hint">
          Ensure the backend is running (default: port 5001).
        </p>
      </div>
    );
  }

  const tickerHeadlines =
    heroHeadlines.length > 1
      ? [...heroHeadlines, ...heroHeadlines]
      : [...heroHeadlines, ...heroHeadlines];

  const focusedTitle = focusedEventId
    ? (volumeFilteredEvents.find((e) => e.id === focusedEventId)?.title ??
      filtered.find((e) => e.id === focusedEventId)?.title)
    : null;

  const aggregateStatsSection = (
    <div
      className="dashboard-deep-stats dashboard-cashflow-kpis"
      aria-label="Aggregate trades metrics for this scope"
    >
      {displayAnalytics && !(cashFlowChartLoading || globalTradesPending) ? (
        <>
          <div className="dashboard-deep-stat">
            <p className="dashboard-deep-stat-value">
              {displayAnalytics.totalTrades.toLocaleString()}
            </p>
            <p className="dashboard-deep-stat-label">Total trades analyzed</p>
          </div>
          <div className="dashboard-deep-stat">
            <p className="dashboard-deep-stat-value">
              $
              {displayAnalytics.totalVolume.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="dashboard-deep-stat-label">Total volume (USD)</p>
          </div>
          <div className="dashboard-deep-stat">
            <p className="dashboard-deep-stat-value">
              {displayAnalytics.uniqueTraders.toLocaleString()}
            </p>
            <p className="dashboard-deep-stat-label">Unique traders</p>
          </div>
          <div className="dashboard-deep-stat">
            <p className="dashboard-deep-stat-value">
              {displayAnalytics.uniqueMarkets.toLocaleString()}
            </p>
            <p className="dashboard-deep-stat-label">Unique markets</p>
          </div>
        </>
      ) : cashFlowChartLoading || globalTradesPending ? (
        <>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="dashboard-deep-stat-skeleton" />
          ))}
        </>
      ) : (
        <p className="hint dashboard-deep-stats-empty">
          No aggregate stats for this scope yet.
        </p>
      )}
    </div>
  );

  const cashflowChartBlock = (
    <>
      {tradesError && (
        <p className="hint">
          Live trades API unavailable ({tradesError}). Chart uses locally saved
          hourly buckets or a demo series.
        </p>
      )}
      {focusedTradesError && (
        <p className="hint">
          Could not load trades for the focused event ({focusedTradesError}).
          Try another bar or Clear.
        </p>
      )}
      {cashFlowChartLoading || globalTradesPending ? (
        <TradesTimeSeriesChart data={[]} loading height={320} />
      ) : displayAnalytics ? (
        <TradesTimeSeriesChart data={displayAnalytics.byTime} height={320} />
      ) : (
        <TradesTimeSeriesChart data={[]} height={320} />
      )}
    </>
  );

  const cashflowSectionTitle = focusedEventId
    ? `Cash flow over time · ${focusedTitle ?? focusedEventId}`
    : "Cash flow over time";

  return (
    <div className="dashboard">
      {onboardingVisible && (
        <DashboardOnboardingBanner
          onDismiss={dismissOnboarding}
          sourceLabel={sourceLabel}
        />
      )}

      <section className="dashboard-live-ticker" aria-label="Live spotlight">
        <span className="dashboard-live-ticker-label">
          <span className="dashboard-live-dot" aria-hidden="true" />
          <span>Live spotlight</span>
        </span>
        <div className="dashboard-live-ticker-viewport">
          <div className="dashboard-live-ticker-track">
            {tickerHeadlines.map((headline, index) => (
              <div
                key={`${index}-${headline.title}`}
                className="dashboard-live-ticker-item"
              >
                {headline.eventUrl || headline.marketUrl ? (
                  <a
                    className="dashboard-live-title dashboard-live-title-link"
                    href={headline.eventUrl ?? headline.marketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {headline.title}
                  </a>
                ) : (
                  <span className="dashboard-live-title">{headline.title}</span>
                )}
                {headline.meta && (
                  <span className="dashboard-live-meta">{headline.meta}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <nav className="dashboard-main-tabs" aria-label="Dashboard sections">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dashboard-main-tab filter-btn ${
              mainTab === tab.id ? "active" : ""
            }`}
            onClick={() => setMainTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        className="dashboard-filter-bar"
        role="group"
        aria-label="Dashboard filters"
      >
        <span className="dashboard-filter-bar-label">Filter by</span>
        <select
          className="dashboard-filter-select"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          aria-label="Category"
        >
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id === "all" ? "All categories" : c.label}
            </option>
          ))}
        </select>
        <select
          className="dashboard-filter-select"
          value={
            windowHours === 6
              ? "6"
              : windowHours === CASHFLOW_PERSIST_LOOKBACK_HOURS
                ? "168"
                : "24"
          }
          onChange={(e) => setWindowHours(Number(e.target.value))}
          aria-label="Time window"
        >
          <option value="168">Any time window</option>
          <option value="6">6h</option>
          <option value="24">24h</option>
        </select>
        <select
          className="dashboard-filter-select"
          value={volumeFilter}
          onChange={(e) => setVolumeFilter(e.target.value as VolumeFilterId)}
          aria-label="Volume"
        >
          {VOLUME_FILTER_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div
          className="dashboard-suspicion-filter"
          role="group"
          aria-label="Suspicion signal"
        >
          <span className="dashboard-suspicion-filter-label term-help-inline">
            Suspicion signal
            <SuspicionTermHelp />
          </span>
          {(
            [
              { id: "all" as const, label: "All" },
              { id: "high" as const, label: "High" },
              { id: "medium" as const, label: "Med" },
              { id: "low" as const, label: "Low" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`filter-btn dashboard-suspicion-filter-btn ${
                suspicionFilter === opt.id ? "active" : ""
              }`}
              onClick={() => setSuspicionFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mainTab === "markets" && (
        <section
          className="dashboard-section dashboard-section-full dashboard-trending-nav"
          aria-labelledby="markets-split-heading"
        >
          <h2 id="markets-split-heading" className="visually-hidden">
            Top markets and cash flow
          </h2>
          <div className="dashboard-markets-split">
            <div className="dashboard-top-markets-column">
              <div className="dashboard-top-markets-header">
                <h3 className="dashboard-trending-title dashboard-top-markets-h3">
                  Top markets
                </h3>
                <label className="dashboard-sort-control">
                  <span className="hint">Sort:</span>
                  <select
                    className="dashboard-filter-select"
                    value="volume"
                    disabled
                    aria-label="Sort markets"
                  >
                    <option value="volume">volume</option>
                  </select>
                </label>
              </div>
              {focusedEventId && (
                <div className="dashboard-focus-chip-wrap">
                  <span className="dashboard-focus-chip-label">Focused:</span>
                  <span
                    className="dashboard-focus-chip-title"
                    title={focusedTitle ?? ""}
                  >
                    {focusedTitle && focusedTitle.length > 40
                      ? `${focusedTitle.slice(0, 40)}…`
                      : (focusedTitle ?? focusedEventId)}
                  </span>
                  <button
                    type="button"
                    className="dashboard-focus-clear"
                    onClick={clearFocus}
                  >
                    Clear
                  </button>
                </div>
              )}
              {trendChartLoading ? (
                <div
                  className="chart-panel-skeleton trend-chart-loading"
                  style={{ minHeight: 200 }}
                  aria-busy="true"
                />
              ) : !trendingChartData.length ? (
                <p className="hint">
                  No markets match these filters. Try widening volume or
                  suspicion.
                </p>
              ) : (
                <ul className="dashboard-top-markets-list">
                  {trendingChartData.map((row, index) => {
                    const event = volumeFilteredEvents.find(
                      (e) => e.id === row.eventId,
                    );
                    const cat = event ? primaryCategoryLabel(event) : "—";
                    const sus = suspicionUi(row.suspicion);
                    const selected = row.eventId === focusedEventId;
                    return (
                      <li key={row.eventId}>
                        <button
                          type="button"
                          className={`dashboard-top-market-row ${
                            selected ? "selected" : ""
                          }`}
                          onClick={() => handleTrendBarClick(row.eventId)}
                        >
                          <span className="dashboard-top-market-rank">
                            {index + 1}
                          </span>
                          <span className="dashboard-top-market-body">
                            <span className="dashboard-top-market-title">
                              {row.fullName ?? row.name}
                            </span>
                            <span className="dashboard-top-market-meta">
                              {cat} • ${row.volume.toLocaleString()}
                            </span>
                          </span>
                          <span
                            className={`dashboard-top-market-signal ${sus.className}`}
                          >
                            {sus.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <SuspicionSignalLegend />
            </div>
            <div
              className="dashboard-cashflow-column dashboard-panel-secondary dashboard-cashflow-section"
              aria-labelledby="cashflow-section-heading"
            >
              <h2
                id="cashflow-section-heading"
                className="dashboard-secondary-h2"
              >
                {cashflowSectionTitle}
              </h2>
              <p className="dashboard-cashflow-lede">
                Secondary read on {sourceLabel} bets · {cashflowWindowLabel}
                {focusedEventId ? " · scoped to focused event" : ""}
              </p>
              <div
                className="cashflow-range-toggle"
                role="tablist"
                aria-label="Cash flow time window"
              >
                {CASHFLOW_WINDOWS.map((opt) => (
                  <button
                    key={opt.hours}
                    type="button"
                    className={`cashflow-range-chip ${
                      windowHours === opt.hours ? "active" : ""
                    }`}
                    onClick={() => setWindowHours(opt.hours)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {aggregateStatsSection}
              {cashflowChartBlock}
            </div>
          </div>
        </section>
      )}

      {mainTab === "tradeFlow" && (
        <section
          className="dashboard-section dashboard-trending-nav"
          aria-labelledby="trending-heading"
        >
          <div className="dashboard-section-header-row">
            <div>
              <h2 id="trending-heading" className="dashboard-trending-title">
                Trending markets
              </h2>
              <p className="dashboard-trending-sub">
                Top events by volume ·{" "}
                <span className="term-help-inline">
                  suspicion signal
                  <SuspicionTermHelp />
                </span>{" "}
                on each bar · click to focus the rest of the dashboard
              </p>
            </div>
            {focusedEventId && (
              <div className="dashboard-focus-chip-wrap">
                <span className="dashboard-focus-chip-label">Focused:</span>
                <span
                  className="dashboard-focus-chip-title"
                  title={focusedTitle ?? ""}
                >
                  {focusedTitle && focusedTitle.length > 40
                    ? `${focusedTitle.slice(0, 40)}…`
                    : (focusedTitle ?? focusedEventId)}
                </span>
                <button
                  type="button"
                  className="dashboard-focus-clear"
                  onClick={clearFocus}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <TrendChart
            data={trendingChartDataAll}
            height={300}
            selectedEventId={focusedEventId}
            onBarClick={handleTrendBarClick}
            loading={trendChartLoading}
          />
          <SuspicionSignalLegend />
        </section>
      )}

      {mainTab === "newsSentiment" && (
        <section className="dashboard-section dashboard-section-full">
          <h2 className="dashboard-trending-title">News &amp; sentiment</h2>
          <p className="hint">
            Wire your preferred news and NLP feeds here; this tab is a dedicated
            slot in the layout.
          </p>
        </section>
      )}

      {mainTab === "whale" && (
        <section className="dashboard-section dashboard-section-full">
          <h2 className="dashboard-trending-title dashboard-heading-with-help">
            Whale activity
            <WhalesTermHelp />
          </h2>
          <p className="dashboard-trending-sub">
            Addresses and pre-deadline concentration for the current scope (
            {cashflowWindowLabel}
            {focusedEventId ? ", focused event" : ""}).
          </p>
          {tradesError && (
            <p className="hint">Trades analytics unavailable: {tradesError}</p>
          )}
          {focusedTradesError && <p className="hint">{focusedTradesError}</p>}
          <div className="dashboard-whale-tab-grid">
            <div className="analytics-panel">
              <h3 className="analytics-subtitle dashboard-heading-with-help">
                Whale addresses
                <WhalesTermHelp />
              </h3>
              {cashFlowChartLoading || globalTradesPending ? (
                <div
                  className="chart-panel-skeleton trend-chart-loading"
                  style={{ minHeight: 200 }}
                  aria-busy="true"
                />
              ) : displayAnalytics ? (
                <WhaleAddressesPanel data={displayAnalytics.whaleTraders} />
              ) : (
                <WhaleAddressesPanel data={[]} />
              )}
            </div>
            <div className="analytics-panel">
              <h3 className="analytics-subtitle">Pre-deadline volume spike</h3>
              {cashFlowChartLoading || globalTradesPending ? (
                <PreDeadlineChart
                  window={{
                    windowHours: windowHours,
                    windowStart: "",
                    windowEnd: "",
                    volume: 0,
                    tradeCount: 0,
                    shareOfTotalVolume: 0,
                  }}
                  totalVolume={1}
                  loading
                />
              ) : displayAnalytics ? (
                <PreDeadlineChart
                  window={displayAnalytics.preDeadlineWindow}
                  totalVolume={displayAnalytics.totalVolume}
                />
              ) : (
                <PreDeadlineChart
                  window={{
                    windowHours: windowHours,
                    windowStart: "",
                    windowEnd: "",
                    volume: 0,
                    tradeCount: 0,
                    shareOfTotalVolume: 0,
                  }}
                  totalVolume={0}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {mainTab === "researchNotes" && (
        <section className="dashboard-section dashboard-section-full">
          <h2 className="dashboard-trending-title">Research notes</h2>
          <p className="hint">
            Use this area for hypotheses, follow-ups, and desk notes tied to the
            current session.
          </p>
        </section>
      )}

      {mainTab === "firstTimeUser" && (
        <section className="dashboard-section dashboard-section-full dashboard-first-time-user">
          <h2 className="dashboard-trending-title">First time user guide</h2>
          <p className="dashboard-trending-sub">
            New here? This page explains what to click, what each chart is
            showing, and how to get useful answers quickly.
          </p>
          <div className="dashboard-first-time-grid">
            <article className="dashboard-first-time-card">
              <h3>Start here</h3>
              <ol>
                <li>
                  Choose a category and time range at the top so you only see
                  what matters to you.
                </li>
                <li>
                  Open <strong>Markets</strong> to see what people are paying
                  the most attention to right now. Markets are the individual
                  events or questions that people are betting on. Top markets
                  are the ones with the most volume. You can click on a market
                  to see more details about it.
                </li>
                <li>
                  Check <strong>Trade flow</strong> and{" "}
                  <strong>Whale activity</strong> to see whether interest comes
                  from many people or just a few big players. Whale activity is
                  a measure of the concentration of trading activity among a
                  small number of large accounts. Trade flow, or cash flow, is a
                  measure of the overall volume of trading activity.
                </li>
                <li>
                  Save your thoughts in <strong>Research notes</strong>, then
                  ask the chatbot to explain anything that is unclear. The
                  chatbot is a helpful assistant that can answer questions and
                  help you understand the data. The chatbot is not a financial
                  advisor and does not give financial advice or tell you to
                  place bets.
                </li>
              </ol>
            </article>

            <article className="dashboard-first-time-card">
              <h3>How to read the key graphs</h3>
              <ul>
                <li>
                  <strong>Top markets / trending:</strong> bigger bars mean more
                  activity. Click one to make the rest of the page focus on that
                  topic.
                </li>
                <li>
                  <strong>Cash flow over time:</strong> when the line goes up,
                  more money is being traded. Big jumps often mean something new
                  happened.
                </li>
                <li>
                  <strong>Whale addresses:</strong> shows whether a few very
                  large accounts are doing most of the trading.
                </li>
                <li>
                  <strong>Pre-deadline spike:</strong> shows if trading suddenly
                  increases near the end, when people may be reacting last
                  minute. Pre-deadline spike is a measure of the volume of
                  trading activity near the end of the trading period.
                </li>
              </ul>
            </article>

            <article className="dashboard-first-time-card">
              <h3>How to use suspicion signal</h3>
              <ul>
                <li>
                  <strong>High:</strong> this item looks unusual and may be
                  worth a closer look. High suspicion is a measure of the
                  concentration of trading activity among a small number of
                  large accounts.
                </li>
                <li>
                  <strong>Med:</strong> some unusual signs, but not enough to be
                  sure. Medium suspicion is a measure of the concentration of
                  trading activity among a small number of large accounts.
                </li>
                <li>
                  <strong>Low:</strong> looks more normal right now. Low
                  suspicion is a measure of the concentration of trading
                  activity among a small number of large accounts.
                </li>
              </ul>
              <p className="hint">
                These labels are warning hints, not proof that anyone did
                something wrong.
              </p>
            </article>

            <article className="dashboard-first-time-card">
              <h3>Good first questions to ask</h3>
              <ul>
                <li>What topic is getting the most attention today?</li>
                <li>
                  Is this trend coming from lots of people or a few big traders?
                </li>
                <li>Did anything change a lot near the end of trading?</li>
                <li>What should I check again later today?</li>
              </ul>
            </article>
          </div>
        </section>
      )}

      <section className="dashboard-section dashboard-section-full dashboard-deep-section">
        <button
          type="button"
          className="dashboard-deep-toggle"
          aria-expanded={showDeepAnalysis}
          onClick={() => setShowDeepAnalysis((o) => !o)}
        >
          <span>
            {showDeepAnalysis ? "Hide deep analysis" : "Show deep analysis"}
          </span>
          <span
            className={`accordion-chevron ${showDeepAnalysis ? "open" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>
        <p className="dashboard-deep-lede hint">
          Expert-level: duplicate time series, whale addresses (accordion), and
          pre-deadline split for the current scope ({cashflowWindowLabel}).
          Aggregate headline stats live next to cash flow on the Markets tab.
        </p>

        {showDeepAnalysis && (
          <div className="dashboard-deep-panels">
            <h2 className="dashboard-deep-heading dashboard-heading-with-help">
              <span>Trading activity &amp; whales ({cashflowWindowLabel})</span>
              <WhalesTermHelp />
            </h2>
            {tradesError && (
              <p className="hint">
                Trades analytics unavailable: {tradesError}
              </p>
            )}
            {focusedTradesError && <p className="hint">{focusedTradesError}</p>}

            <div className="trading-activity-grid trading-activity-grid-deep">
              <div className="analytics-panel">
                <h3 className="analytics-subtitle">
                  Incremental trading patterns
                </h3>
                {cashFlowChartLoading || globalTradesPending ? (
                  <TradesTimeSeriesChart data={[]} loading />
                ) : displayAnalytics ? (
                  <TradesTimeSeriesChart data={displayAnalytics.byTime} />
                ) : (
                  <TradesTimeSeriesChart data={[]} />
                )}
              </div>
              <div className="analytics-panel dashboard-deep-whale-accordion-wrap">
                <div className="dashboard-deep-accordion">
                  <button
                    type="button"
                    className="dashboard-deep-accordion-trigger"
                    aria-expanded={whaleAccordionOpen}
                    id="deep-whale-accordion-trigger"
                    aria-controls="deep-whale-accordion-panel"
                    onClick={() => setWhaleAccordionOpen((o) => !o)}
                  >
                    <span className="dashboard-deep-accordion-title dashboard-heading-with-help">
                      Whale addresses
                      <WhalesTermHelp />
                    </span>
                    <span
                      className="dashboard-deep-accordion-chevron"
                      aria-hidden
                    >
                      {whaleAccordionOpen ? "▴" : "▾"}
                    </span>
                  </button>
                  {whaleAccordionOpen && (
                    <div
                      id="deep-whale-accordion-panel"
                      role="region"
                      aria-labelledby="deep-whale-accordion-trigger"
                      className="dashboard-deep-accordion-panel"
                    >
                      {cashFlowChartLoading || globalTradesPending ? (
                        <div
                          className="chart-panel-skeleton trend-chart-loading"
                          style={{ minHeight: 200 }}
                          aria-busy="true"
                        />
                      ) : displayAnalytics ? (
                        <WhaleAddressesPanel
                          data={displayAnalytics.whaleTraders}
                        />
                      ) : (
                        <WhaleAddressesPanel data={[]} />
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="analytics-panel">
                <h3 className="analytics-subtitle">
                  Pre-deadline volume spike
                </h3>
                {cashFlowChartLoading || globalTradesPending ? (
                  <PreDeadlineChart
                    window={{
                      windowHours: windowHours,
                      windowStart: "",
                      windowEnd: "",
                      volume: 0,
                      tradeCount: 0,
                      shareOfTotalVolume: 0,
                    }}
                    totalVolume={1}
                    loading
                  />
                ) : displayAnalytics ? (
                  <PreDeadlineChart
                    window={displayAnalytics.preDeadlineWindow}
                    totalVolume={displayAnalytics.totalVolume}
                  />
                ) : (
                  <PreDeadlineChart
                    window={{
                      windowHours: windowHours,
                      windowStart: "",
                      windowEnd: "",
                      volume: 0,
                      tradeCount: 0,
                      shareOfTotalVolume: 0,
                    }}
                    totalVolume={0}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-section dashboard-section-full accordion-section">
        <button
          id="events-markets-accordion-trigger"
          type="button"
          className="accordion-trigger"
          onClick={() => setMarketsAccordionOpen((open) => !open)}
          aria-expanded={marketsAccordionOpen}
          aria-controls="events-markets-accordion"
        >
          <span className="accordion-title" role="heading" aria-level={2}>
            Events & markets
          </span>
          <span
            className={`accordion-chevron ${marketsAccordionOpen ? "open" : ""}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>
        <p className="dashboard-cashflow-lede">
          {focusedEventId
            ? "Showing the focused event only. Clear focus to see the full list."
            : "Browse events matching your category and volume filters."}
        </p>
        <div
          id="events-markets-accordion"
          role="region"
          aria-labelledby="events-markets-accordion-trigger"
          className={`accordion-content ${marketsAccordionOpen ? "open" : ""}`}
          aria-hidden={!marketsAccordionOpen}
          {...(!marketsAccordionOpen ? { inert: "" } : {})}
        >
          <MarketList events={eventsForList} />
        </div>
      </section>
    </div>
  );
}
