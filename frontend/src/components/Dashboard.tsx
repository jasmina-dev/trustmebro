// utilized github copilot

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  fetchEvents,
  fetchMarkets,
  fetchTradesAnalytics,
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
import { computeEventSuspicion } from "./suspicion";
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

interface DashboardProps {
  category: string;
  onContextChange?: (ctx: string) => void;
}

const CASHFLOW_WINDOWS = [
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: CASHFLOW_PERSIST_LOOKBACK_HOURS },
] as const;

function polymarketIdsForEvent(event: PolymarketEvent | undefined): string[] {
  if (!event?.markets?.length) return [];
  const ids = new Set<string>();
  for (const m of event.markets) {
    const c = m.conditionId;
    if (c) ids.add(String(c));
  }
  return Array.from(ids);
}

const POLYMARKET_BASE_URL = "https://polymarket.com";

function polymarketEventUrl(event: PolymarketEvent): string | undefined {
  const slug = event.slug?.trim();
  return slug ? `${POLYMARKET_BASE_URL}/event/${slug}` : undefined;
}

function polymarketMarketUrl(
  market: PolymarketMarket | undefined,
): string | undefined {
  const slug = market?.slug?.trim() || market?.marketSlug?.trim();
  return slug ? `${POLYMARKET_BASE_URL}/market/${slug}` : undefined;
}

function DashboardOnboardingBanner({ onDismiss }: { onDismiss: () => void }) {
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
              This dashboard pulls Polymarket volume, whale concentration, and
              late-window activity into one research surface.
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

export function Dashboard({ category, onContextChange }: DashboardProps) {
  const [events, setEvents] = useState<PolymarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalTradesRaw, setGlobalTradesRaw] =
    useState<TradesAnalytics | null>(null);
  const [persistedSeries, setPersistedSeries] = useState<
    TradesAnalytics["byTime"]
  >(() => loadTrimmedCashflowBuckets());
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

  const dismissOnboarding = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setOnboardingVisible(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchEvents(30, false), fetchMarkets(100)])
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
            ev.markets.push(m);
          }
        }
        setEvents(Array.from(byEvent.values()));
      })
      .catch((err) => setError(err.message ?? "Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

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
      if (isSupabaseChartsConfigured() && !cancelled) {
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
  }, []);

  function extractYesPrice(
    market: PolymarketMarket | undefined,
  ): number | null {
    if (!market || market.outcomePrices == null) return null;
    const first = String(market.outcomePrices).split(",")[0];
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
    const polyIds = polymarketIdsForEvent(event);
    const eventIdParam = focusedEventId;

    async function loadFocused() {
      if (isSupabaseChartsConfigured() && polyIds.length > 0) {
        const since = new Date(
          Date.now() - CASHFLOW_PERSIST_LOOKBACK_HOURS * 3_600_000,
        ).toISOString();
        const buckets = await fetchHourlyCashflowForPolymarketIds(
          since,
          polyIds,
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
  }, [focusedEventId, filtered]);

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
    if (!focusedEventId) return filtered;
    return filtered.filter((e) => e.id === focusedEventId);
  }, [filtered, focusedEventId]);

  const highVolumeEventIds = useMemo(
    () => new Set(analytics.highVolumeEvents.map((e) => e.id)),
    [analytics.highVolumeEvents],
  );

  const inconsistentTitles = useMemo(
    () => new Set(analytics.inconsistentEvents),
    [analytics.inconsistentEvents],
  );

  const trendingChartData: TrendChartRow[] = useMemo(() => {
    const sorted = filtered
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
  }, [filtered, highVolumeEventIds, inconsistentTitles, globalTradesRaw]);

  const handleTrendBarClick = useCallback((eventId: string) => {
    setFocusedEventId((prev) => (prev === eventId ? null : eventId));
  }, []);

  const clearFocus = useCallback(() => setFocusedEventId(null), []);

  const heroHeadlines = useMemo(() => {
    if (focusedEventId) {
      const ev = events.find((e) => e.id === focusedEventId);
      if (ev) {
        const volume =
          ev.markets?.reduce(
            (s, m) =>
              s + (m.volumeNum ?? (m.volume as number | undefined) ?? 0),
            0,
          ) ?? 0;
        const metaParts: string[] = [];
        if (ev.category) metaParts.push(ev.category);
        if (volume > 0) metaParts.push(`$${volume.toLocaleString()} volume`);
        metaParts.push("Focused from trending");
        return [
          {
            title:
              ev.title && ev.title.length > 100
                ? `${ev.title.slice(0, 100)}…`
                : (ev.title ?? "Untitled market event"),
            meta: metaParts.join(" • "),
            eventUrl: polymarketEventUrl(ev),
            marketUrl: polymarketMarketUrl(ev.markets?.[0]),
          },
        ];
      }
    }

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
        eventUrl: polymarketEventUrl(event),
        marketUrl: polymarketMarketUrl(event.markets?.[0]),
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
  }, [events, displayAnalytics, focusedEventId]);

  const contextString = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Active filter: ${category}`);
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
    category,
    filtered,
    analytics,
    displayAnalytics,
    cashflowWindowLabel,
    focusedEventId,
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
        <p className="hint">Ensure the backend is running on port 5000.</p>
      </div>
    );
  }

  const tickerHeadlines =
    heroHeadlines.length > 1
      ? [...heroHeadlines, ...heroHeadlines]
      : [...heroHeadlines, ...heroHeadlines];

  const focusedTitle = focusedEventId
    ? filtered.find((e) => e.id === focusedEventId)?.title
    : null;

  return (
    <div className="dashboard">
      {onboardingVisible && (
        <DashboardOnboardingBanner onDismiss={dismissOnboarding} />
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
              Top events by volume · suspicion signal on each bar · click to
              focus the rest of the dashboard
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
          data={trendingChartData}
          height={300}
          selectedEventId={focusedEventId}
          onBarClick={handleTrendBarClick}
          loading={trendChartLoading}
        />
        <SuspicionSignalLegend />
      </section>

      <section
        className="dashboard-section dashboard-section-full dashboard-panel-secondary dashboard-cashflow-section"
        aria-labelledby="cashflow-section-heading"
      >
        <h2 id="cashflow-section-heading" className="dashboard-secondary-h2">
          Cash flow over time
        </h2>
        <p className="dashboard-cashflow-lede">
          Secondary read on Polymarket bets · {cashflowWindowLabel}
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
        {tradesError && (
          <p className="hint">
            Live trades API unavailable ({tradesError}). Chart uses locally
            saved hourly buckets or a demo series.
          </p>
        )}
        {focusedTradesError && (
          <p className="hint">
            Could not load trades for the focused event ({focusedTradesError}
            ). Try another bar or Clear.
          </p>
        )}
        {cashFlowChartLoading || globalTradesPending ? (
          <TradesTimeSeriesChart data={[]} loading height={320} />
        ) : displayAnalytics ? (
          <TradesTimeSeriesChart data={displayAnalytics.byTime} height={320} />
        ) : (
          <TradesTimeSeriesChart data={[]} height={320} />
        )}
      </section>

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
          Expert-level: duplicate time series, whale addresses (accordion),
          pre-deadline split, and headline stats for the current scope (
          {cashflowWindowLabel}).
        </p>

        {showDeepAnalysis && (
          <div className="dashboard-deep-panels">
            <h2 className="dashboard-deep-heading">
              Trading activity &amp; whales ({cashflowWindowLabel})
            </h2>
            {tradesError && (
              <p className="hint">
                Trades analytics unavailable: {tradesError}
              </p>
            )}
            {focusedTradesError && <p className="hint">{focusedTradesError}</p>}

            <div
              className="dashboard-deep-stats"
              aria-label="Aggregate trades metrics for this scope"
            >
              {displayAnalytics &&
              !(cashFlowChartLoading || globalTradesPending) ? (
                <>
                  <div className="dashboard-deep-stat">
                    <p className="dashboard-deep-stat-value">
                      {displayAnalytics.totalTrades.toLocaleString()}
                    </p>
                    <p className="dashboard-deep-stat-label">
                      Total trades analyzed
                    </p>
                  </div>
                  <div className="dashboard-deep-stat">
                    <p className="dashboard-deep-stat-value">
                      $
                      {displayAnalytics.totalVolume.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="dashboard-deep-stat-label">
                      Total volume (USD)
                    </p>
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
                    <span className="dashboard-deep-accordion-title">
                      Whale addresses
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
            : "Browse events matching your category filter."}
        </p>
        <div
          id="events-markets-accordion"
          role="region"
          aria-labelledby="events-markets-accordion-trigger"
          className={`accordion-content ${marketsAccordionOpen ? "open" : ""}`}
          aria-hidden={!marketsAccordionOpen}
          {...(!marketsAccordionOpen ? { inert: true } : {})}
        >
          <MarketList events={eventsForList} />
        </div>
      </section>
    </div>
  );
}
