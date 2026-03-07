import type { PolymarketEvent } from '../api/client'
import './MarketList.css'

interface MarketListProps {
  events: PolymarketEvent[]
}

function formatVolume(v: number | undefined): string {
  if (v == null || v === 0) return '—'
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

export function MarketList({ events }: MarketListProps) {
  if (!events.length) {
    return (
      <div className="market-list empty">
        <p>No events match the selected category.</p>
      </div>
    )
  }

  return (
    <ul className="market-list">
      {events.slice(0, 50).map((event) => {
        const volume = event.markets?.reduce(
          (s, m) => s + (m.volumeNum ?? (m.volume as number) ?? 0),
          0
        ) ?? 0
        const prices = event.markets?.[0]?.outcomePrices
        const yesPrice = prices
          ? (parseFloat(String(prices).split(',')[0]) * 100).toFixed(0)
          : '—'

        return (
          <li key={event.id} className="market-card">
            <div className="market-card-main">
              <h3 className="market-title">{event.title}</h3>
              {event.description && (
                <p className="market-desc">
                  {event.description.slice(0, 120)}
                  {event.description.length > 120 ? '…' : ''}
                </p>
              )}
              <div className="market-meta">
                <span className="meta-volume">Vol: {formatVolume(volume)}</span>
                {event.markets?.[0] && (
                  <span className="meta-price">Yes: {yesPrice}¢</span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
