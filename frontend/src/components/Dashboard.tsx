import { useEffect, useState, useMemo } from 'react'
import {
  fetchEvents,
  fetchMarkets,
  fetchTradesAnalytics,
  type PolymarketEvent,
  type PolymarketMarket,
  type TradesAnalytics,
} from '../api/client'
import { MarketList } from './MarketList'
import { TrendChart } from './TrendChart'
import { ProbabilityHistogram } from './ProbabilityHistogram'
import { TradesTimeSeriesChart } from './TradesTimeSeriesChart'
import { WhaleTradersChart } from './WhaleTradersChart'
import { PreDeadlineChart } from './PreDeadlineChart'
import './Dashboard.css'

interface DashboardProps {
  category: string
}

const CASHFLOW_WINDOWS = [
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 24 * 7 },
] as const

export function Dashboard({ category }: DashboardProps) {
  const [events, setEvents] = useState<PolymarketEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tradesAnalytics, setTradesAnalytics] = useState<TradesAnalytics | null>(null)
  const [tradesError, setTradesError] = useState<string | null>(null)
  const [headlineIndex, setHeadlineIndex] = useState(0)
  const [windowHours, setWindowHours] = useState<number>(24)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([fetchEvents(30, false), fetchMarkets(100)])
      .then(([eventList, markets]) => {
        const byEvent = new Map<string, PolymarketEvent>()
        for (const e of eventList) {
          if (e && e.id) byEvent.set(e.id, { ...e, markets: e.markets ?? [] })
        }
        for (const m of markets) {
          if (!m || !(m as unknown as { eventId?: string }).eventId) continue
          const eid = (m as unknown as { eventId: string }).eventId
          const ev = byEvent.get(eid)
          if (ev) {
            if (!ev.markets) ev.markets = []
            ev.markets.push(m)
          }
        }
        setEvents(Array.from(byEvent.values()))
      })
      .catch((err) => setError(err.message ?? 'Failed to load data'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setTradesAnalytics(null)
    setTradesError(null)
    fetchTradesAnalytics({ windowHours })
      .then((res) => {
        setTradesAnalytics(res.analytics)
        setTradesError(null)
      })
      .catch((err) => {
        setTradesError(err.message ?? 'Failed to load trades analytics')
      })
  }, [windowHours])

  function extractYesPrice(market: PolymarketMarket | undefined): number | null {
    if (!market || market.outcomePrices == null) return null
    const first = String(market.outcomePrices).split(',')[0]
    const v = parseFloat(first)
    if (!Number.isFinite(v)) return null
    return v
  }

  const filtered = useMemo(() => {
    if (category === 'all') return events
    const target = category.toLowerCase()
    return events.filter((e) => {
      const eventCats = e.tmCategories ?? []
      if (eventCats.some((c) => c.toLowerCase() === target)) return true
      for (const m of e.markets ?? []) {
        const marketCats = m.tmCategories ?? []
        if (marketCats.some((c) => c.toLowerCase() === target)) return true
      }
      return false
    })
  }, [events, category])

  const analytics = useMemo(() => {
    const allMarkets: PolymarketMarket[] = []
    const eventVolumes: { id: string; title: string; volume: number }[] = []
    const inconsistentEvents: string[] = []

    for (const event of filtered) {
      const markets = event.markets ?? []
      if (markets.length) {
        allMarkets.push(...markets)
      }

      const volume =
        markets.reduce(
          (s, m) => s + (m.volumeNum ?? (m.volume as number | undefined) ?? 0),
          0
        ) ?? 0

      eventVolumes.push({ id: event.id, title: event.title, volume })

      const maxProbs = markets
        .map((m) => extractYesPrice(m))
        .filter((p): p is number => p != null)
      const sumMax = maxProbs.reduce((s, v) => s + v, 0)

      if (maxProbs.length > 1 && sumMax > 1.5) {
        inconsistentEvents.push(event.title)
      }
    }

    const yesProbs: number[] = []
    let extremeCount = 0

    for (const m of allMarkets) {
      const p = extractYesPrice(m)
      if (p == null) continue
      yesProbs.push(p)
      if (p >= 0.9 || p <= 0.1) extremeCount++
    }

    const totalMarkets = yesProbs.length
    const buckets = new Array(10).fill(0)
    for (const p of yesProbs) {
      const idx = Math.min(9, Math.max(0, Math.floor(p * 10)))
      buckets[idx]++
    }

    const histogramData = buckets.map((count, idx) => ({
      bucket: `${idx * 10}-${idx === 9 ? 100 : (idx + 1) * 10}%`,
      count,
    }))

    const vols = eventVolumes.map((v) => v.volume).filter((v) => v > 0)
    let highVolumeEvents: (typeof eventVolumes[number] & { z: number })[] = []

    if (vols.length) {
      const mean = vols.reduce((s, v) => s + v, 0) / vols.length
      const variance =
        vols.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vols.length
      const std = Math.sqrt(variance) || 1

      highVolumeEvents = eventVolumes
        .map((ev) => ({
          ...ev,
          z: std ? (ev.volume - mean) / std : 0,
        }))
        .filter((ev) => ev.z >= 2)
        .sort((a, b) => b.z - a.z)
        .slice(0, 5)
    }

    return {
      histogramData,
      extremeCount,
      totalMarkets,
      highVolumeEvents,
      inconsistentEvents,
    }
  }, [filtered])

  const heroHeadlines = useMemo(() => {
    const headlines: { title: string; meta?: string }[] = []

    for (const event of filtered.slice(0, 6)) {
      const volume =
        event.markets?.reduce(
          (s, m) => s + (m.volumeNum ?? (m.volume as number | undefined) ?? 0),
          0
        ) ?? 0

      const title =
        event.title && event.title.length > 80
          ? `${event.title.slice(0, 80)}…`
          : event.title ?? 'Untitled market event'

      const metaParts: string[] = []
      if (event.category) metaParts.push(event.category)
      if (volume > 0) metaParts.push(`$${volume.toLocaleString()} volume`)

      headlines.push({
        title,
        meta: metaParts.join(' • ') || undefined,
      })
    }

    if (!headlines.length && tradesAnalytics) {
      headlines.push({
        title: 'Live trading window',
        meta: `${tradesAnalytics.totalTrades.toLocaleString()} trades in recent window`,
      })
    }

    if (!headlines.length) {
      headlines.push({
        title: 'Monitoring real-time prediction markets…',
        meta: 'Waiting for market data from the API',
      })
    }

    return headlines
  }, [filtered, tradesAnalytics])

  const cashflowWindowLabel = useMemo(() => {
    if (windowHours === 6) return 'last 6h'
    if (windowHours === 24) return 'last 24h'
    if (windowHours === 24 * 7) return 'last 7d'
    return `last ${windowHours}h`
  }, [windowHours])

  useEffect(() => {
    if (!heroHeadlines.length) return

    const id = window.setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % heroHeadlines.length)
    }, 6000)

    return () => window.clearInterval(id)
  }, [heroHeadlines, heroHeadlines.length])

  if (loading) {
    return (
      <div className="dashboard dashboard-loading">
        <p>Loading market data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard dashboard-error">
        <p>{error}</p>
        <p className="hint">Ensure the backend is running on port 5000.</p>
      </div>
    )
  }

  const chartData = filtered
    .slice(0, 10)
    .map((e) => ({
      name: e.title.slice(0, 24) + (e.title.length > 24 ? '…' : ''),
      volume: e.markets?.reduce((s, m) => s + (m.volumeNum ?? m.volume ?? 0), 0) ?? 0,
    }))
    .filter((d) => d.volume > 0)
    .sort((a, b) => b.volume - a.volume)

  const activeHeadline = heroHeadlines[headlineIndex] ?? heroHeadlines[0]

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div className="hero-left">
          <div className="hero-kicker-row">
            <span className="hero-pill">Real-time</span>
            <span className="hero-label">News &amp; Sentiment</span>
          </div>
          <div className="hero-headline-shell">
            <div
              key={`${headlineIndex}-${activeHeadline?.title ?? 'headline'}`}
              className="hero-headline"
            >
              <h2 className="hero-heading">{activeHeadline?.title}</h2>
              {activeHeadline?.meta && (
                <p className="hero-meta">{activeHeadline.meta}</p>
              )}
            </div>
          </div>
          <p className="hero-copy">
            Streaming prediction market activity into a single view of crowd
            expectations, momentum, and structural inefficiencies.
          </p>
        </div>

        <div className="hero-right">
          <div className="hero-chart-card">
            <div className="hero-chart-header">
              <span className="hero-chart-title">Cash flow over time</span>
              <span className="hero-chart-subtitle">
                Recent Polymarket bets · {cashflowWindowLabel}
              </span>
            </div>
            <div className="hero-range-toggle" role="tablist" aria-label="Cash flow time window">
              {CASHFLOW_WINDOWS.map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  className={`hero-range-chip ${
                    windowHours === opt.hours ? 'active' : ''
                  }`}
                  onClick={() => setWindowHours(opt.hours)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {tradesError && (
              <p className="hint">Cash flow data unavailable: {tradesError}</p>
            )}
            {!tradesError && !tradesAnalytics && (
              <p className="hint">Loading cash flow in recent bets…</p>
            )}
            {tradesAnalytics && (
              <TradesTimeSeriesChart data={tradesAnalytics.byTime} height={320} />
            )}
          </div>
        </div>
      </section>

      <section className="dashboard-section dashboard-section-full">
        <h2>Trending markets (top events by volume)</h2>
        <TrendChart data={chartData} />
      </section>

      <div className="dashboard-body-grid">
        <section className="dashboard-section dashboard-section-wide">
          <h2>Probability distribution & anomalies</h2>
          <div className="analytics-grid">
            <div className="analytics-panel">
              <ProbabilityHistogram data={analytics.histogramData} />
            </div>
            <div className="analytics-panel analytics-summary">
              <p>
                <strong>Extreme markets (≥90% or ≤10%):</strong>{' '}
                {analytics.extremeCount} / {analytics.totalMarkets || 0}
              </p>
              {analytics.highVolumeEvents.length > 0 && (
                <>
                  <p>
                    <strong>Unusually high-volume events (z ≥ 2):</strong>
                  </p>
                  <ul>
                    {analytics.highVolumeEvents.map((ev) => (
                      <li key={ev.id}>
                        {ev.title.length > 80
                          ? `${ev.title.slice(0, 80)}…`
                          : ev.title}{' '}
                        — ${ev.volume.toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {analytics.inconsistentEvents.length > 0 && (
                <>
                  <p>
                    <strong>
                      Potentially inconsistent related markets (heuristic):
                    </strong>
                  </p>
                  <ul>
                    {analytics.inconsistentEvents.slice(0, 5).map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                  <p className="hint">
                    Based on multiple markets within the same event whose
                    implied probabilities sum above 150%. This highlights
                    candidates for manual review of economic vs election
                    outcomes.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Trading activity & whales (last 24h window)</h2>
          {tradesError && (
            <p className="hint">Trades analytics unavailable: {tradesError}</p>
          )}
          {!tradesError && !tradesAnalytics && (
            <p className="hint">Loading trades analytics…</p>
          )}
          {tradesAnalytics && (
            <>
              <div className="analytics-grid">
                <div className="analytics-panel">
                  <h3 className="analytics-subtitle">
                    Incremental trading patterns
                  </h3>
                  <TradesTimeSeriesChart data={tradesAnalytics.byTime} />
                </div>
                <div className="analytics-panel">
                  <h3 className="analytics-subtitle">Whale addresses</h3>
                  <WhaleTradersChart data={tradesAnalytics.whaleTraders} />
                </div>
              </div>
              <div className="analytics-grid predeadline-grid">
                <div className="analytics-panel">
                  <h3 className="analytics-subtitle">
                    Pre-deadline volume spike
                  </h3>
                  <PreDeadlineChart
                    window={tradesAnalytics.preDeadlineWindow}
                    totalVolume={tradesAnalytics.totalVolume}
                  />
                </div>
                <div className="analytics-panel analytics-summary">
                  <p>
                    <strong>Total trades analyzed:</strong>{' '}
                    {tradesAnalytics.totalTrades.toLocaleString()}
                  </p>
                  <p>
                    <strong>Total volume (USD):</strong>{' '}
                    {`$${tradesAnalytics.totalVolume.toLocaleString()}`}
                  </p>
                  <p>
                    <strong>Unique traders:</strong>{' '}
                    {tradesAnalytics.uniqueTraders.toLocaleString()}
                  </p>
                  <p>
                    <strong>Unique markets:</strong>{' '}
                    {tradesAnalytics.uniqueMarkets.toLocaleString()}
                  </p>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="dashboard-section dashboard-section-full">
          <h2>Events & markets</h2>
          <MarketList events={filtered} />
        </section>
      </div>
    </div>
  )
}
