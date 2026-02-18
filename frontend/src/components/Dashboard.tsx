import { useEffect, useState, useMemo } from 'react'
import { fetchEvents, fetchMarkets, type PolymarketEvent } from '../api/client'
import { MarketList } from './MarketList'
import { TrendChart } from './TrendChart'
import './Dashboard.css'

interface DashboardProps {
  category: string
}

export function Dashboard({ category }: DashboardProps) {
  const [events, setEvents] = useState<PolymarketEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    if (category === 'all') return events
    return events.filter((e) => {
      const cat = (e.category ?? e.groupItemTitle ?? '').toLowerCase()
      const slug = (e.slug ?? '').toLowerCase()
      const title = (e.title ?? '').toLowerCase()
      const combined = `${cat} ${slug} ${title}`
      return combined.includes(category)
    })
  }, [events, category])

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

  return (
    <div className="dashboard">
      <section className="dashboard-section">
        <h2>Market volume (top events)</h2>
        <TrendChart data={chartData} />
      </section>

      <section className="dashboard-section">
        <h2>Events & markets</h2>
        <MarketList events={filtered} />
      </section>
    </div>
  )
}
